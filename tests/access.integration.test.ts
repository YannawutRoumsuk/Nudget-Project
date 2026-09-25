import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

/**
 * Membership and the member list are SQL, not logic — an upsert that stops
 * reactivating, or a join that starts multiplying rows, would sail past a
 * mocked test. These run against a real database and are skipped when none is
 * configured, so `bun run test:run` still works with nothing installed.
 *
 *   docker compose up -d
 *   TEST_DATABASE_URL=postgres://spendbot:spendbot@localhost:5433/nudget_test bun run test:run
 */
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

if (url) {
	process.env.DATABASE_URL = url;
	process.env.LINE_ALLOWED_USER_ID = 'Uowner';
}

suite('membership against a real database', async () => {
	const { admit, isOwner, resolveMember } = await import('../src/lib/server/access');
	const { listMembers, setUserActive, getUserByLineId, touchUserActivity, updateNotificationPreferences } = await import('../src/lib/server/db/users');
	const { closeDatabase, db } = await import('../src/lib/server/db');
	const { billPayments, bills, categories, creditCards, monthlyCategoryBudgets, monthlyPlans, transactions, userCategoryRules, users } = await import('../src/lib/server/db/schema');

	beforeEach(async () => {
		await db.delete(transactions);
		await db.delete(users);
		await db.insert(categories).values({
			id: 'food', nameTh: 'อาหาร', nameEn: 'Food', kind: 'expense', icon: '🍜', color: '#f00'
		}).onConflictDoNothing();
	});

	afterAll(async () => {
		await closeDatabase();
	});

	it('opens an account for a newcomer and recognises them afterwards', async () => {
		const first = await admit('Uguest', async () => 'เพื่อน');
		expect(first.status).toBe('joined');

		const second = await admit('Uguest');
		expect(second.status).toBe('member');
		expect(second.status === 'member' && second.user.id).toBe(first.status === 'joined' && first.user.id);
		expect((await getUserByLineId('Uguest'))?.displayName).toBe('เพื่อน');
	});

	it('keeps a revoked account out until an owner switches it back on', async () => {
		const joined = await admit('Uguest');
		const id = joined.status === 'joined' ? joined.user.id : 0;

		await setUserActive(id, false);
		expect(await resolveMember('Uguest')).toBeNull();
		expect((await admit('Uguest')).status).toBe('revoked');

		await setUserActive(id, true);
		expect((await resolveMember('Uguest'))?.id).toBe(id);
	});

	it('lets an owner in before any row exists and cannot be locked out by the flag', async () => {
		expect(isOwner('Uowner')).toBe(true);
		const owner = await resolveMember('Uowner');
		expect(owner?.lineUserId).toBe('Uowner');

		// An owner is defined by configuration, so the row follows the config
		// rather than the other way round — otherwise nobody could undo it.
		await setUserActive(owner!.id, false);
		expect((await resolveMember('Uowner'))?.id).toBe(owner!.id);
	});

	it('reports who joined, how much they recorded and recent activity independently of transactions', async () => {
		const guest = await admit('Uguest', async () => 'เพื่อน');
		const guestId = guest.status === 'joined' ? guest.user.id : 0;
		await admit('Uquiet', async () => 'คนเงียบ');

		await db.insert(transactions).values([
			{ userId: guestId, kind: 'expense', amount: '60.00', categoryId: 'food', note: 'ข้าว', occurredAt: new Date('2026-09-01T05:00:00Z'), source: 'line', parsedBy: 'rule' },
			{ userId: guestId, kind: 'expense', amount: '80.00', categoryId: 'food', note: 'กาแฟ', occurredAt: new Date('2026-09-05T05:00:00Z'), source: 'line', parsedBy: 'rule' }
		]);
		await touchUserActivity(guestId, new Date('2026-09-07T05:00:00Z'));

		const members = await listMembers();
		const active = members.find((member) => member.lineUserId === 'Uguest');
		const quiet = members.find((member) => member.lineUserId === 'Uquiet');

		expect(members).toHaveLength(2);
		expect(active?.displayName).toBe('เพื่อน');
		expect(active?.transactionCount).toBe(2);
		expect(active?.lastActivityAt).toEqual(new Date('2026-09-07T05:00:00Z'));
		// Activity is seeded on account creation, even before the first transaction.
		expect(quiet?.transactionCount).toBe(0);
		expect(quiet?.lastActivityAt).toBeInstanceOf(Date);
	});

	it('lists a revoked member so the owner can see and undo it', async () => {
		const joined = await admit('Uguest');
		await setUserActive(joined.status === 'joined' ? joined.user.id : 0, false);
		const members = await listMembers();
		expect(members.find((member) => member.lineUserId === 'Uguest')?.active).toBe(false);
	});

	it('enforces duplicate fingerprints per account without blocking another account', async () => {
		const accountA = await admit('Udedupe-a');
		const accountB = await admit('Udedupe-b');
		const userA = accountA.status === 'joined' ? accountA.user.id : 0;
		const userB = accountB.status === 'joined' ? accountB.user.id : 0;
		const { insertTransactionIfUnique } = await import('../src/lib/server/db/queries');
		const base = {
			kind: 'expense' as const,
			amount: '60.00',
			categoryId: 'food',
			note: 'ข้าว',
			occurredAt: new Date('2026-09-12T05:00:00Z'),
			source: 'line' as const,
			parsedBy: 'rule' as const,
			fingerprint: 'a'.repeat(64)
		};

		expect(await insertTransactionIfUnique({ ...base, userId: userA })).not.toBeNull();
		expect(await insertTransactionIfUnique({ ...base, userId: userA })).toBeNull();
		expect(await insertTransactionIfUnique({ ...base, userId: userB })).not.toBeNull();
	});

	it('excludes marked purchases only from the owner comparison baseline', async () => {
		const accountA = await admit('Ubaseline-a');
		const accountB = await admit('Ubaseline-b');
		const userA = accountA.status === 'joined' ? accountA.user.id : 0;
		const userB = accountB.status === 'joined' ? accountB.user.id : 0;
		const [ordinary, special, otherOwner] = await db.insert(transactions).values([
			{ userId: userA, kind: 'expense', amount: '60.00', categoryId: 'food', note: 'ข้าว', occurredAt: new Date('2026-09-01T05:00:00Z'), source: 'web', parsedBy: 'manual' },
			{ userId: userA, kind: 'expense', amount: '1000.00', categoryId: 'food', note: 'งานพิเศษ', occurredAt: new Date('2026-09-02T05:00:00Z'), source: 'web', parsedBy: 'manual', excludeFromBaseline: true },
			{ userId: userB, kind: 'expense', amount: '9000.00', categoryId: 'food', note: 'ของคนอื่น', occurredAt: new Date('2026-09-03T05:00:00Z'), source: 'web', parsedBy: 'manual' }
		]).returning();
		const { getTotals, updateTransaction } = await import('../src/lib/server/db/queries');
		const range = { from: new Date('2026-08-31T17:00:00Z'), to: new Date('2026-09-30T17:00:00Z') };

		expect((await getTotals(userA, range)).expense).toBe(1060);
		expect((await getTotals(userA, range, undefined, true)).expense).toBe(60);
		expect(await updateTransaction(otherOwner.id, userA, { anomalyDismissed: true })).toBeNull();
		expect((await updateTransaction(ordinary.id, userA, { anomalyDismissed: true }))?.anomalyDismissed).toBe(true);
		expect(special.excludeFromBaseline).toBe(true);
	});

	it('keeps natural-language finance aggregates scoped to the owner and requested filters', async () => {
		const accountA = await admit('Uquery-a');
		const accountB = await admit('Uquery-b');
		const userA = accountA.status === 'joined' ? accountA.user.id : 0;
		const userB = accountB.status === 'joined' ? accountB.user.id : 0;
		await db.insert(categories).values({ id: 'transport', nameTh: 'เดินทาง', nameEn: 'Transport', kind: 'expense', icon: '🚕', color: '#00f' }).onConflictDoNothing();
		await db.insert(transactions).values([
			{ userId: userA, kind: 'expense', amount: '60.00', categoryId: 'food', note: 'ข้าว', occurredAt: new Date('2026-09-01T05:00:00Z'), paymentMethod: 'cash', source: 'web', parsedBy: 'manual' },
			{ userId: userA, kind: 'expense', amount: '100.00', categoryId: 'transport', note: 'รถ', occurredAt: new Date('2026-09-02T05:00:00Z'), paymentMethod: 'bank', source: 'web', parsedBy: 'manual' },
			{ userId: userB, kind: 'expense', amount: '9000.00', categoryId: 'food', note: 'ข้อมูลอีกบัญชี', occurredAt: new Date('2026-09-01T05:00:00Z'), paymentMethod: 'cash', source: 'web', parsedBy: 'manual' }
		]);
		const { getFinanceQueryAggregate } = await import('../src/lib/server/db/queries');
		const result = await getFinanceQueryAggregate(userA, {
			from: new Date('2026-08-31T17:00:00Z'), to: new Date('2026-09-30T17:00:00Z'),
			kind: 'expense', categoryIds: ['food'], paymentMethod: 'cash', groupBy: 'category'
		});
		expect(result.totals).toMatchObject({ expense: 60, income: 0, count: 1 });
		expect(result.breakdown).toEqual([{ key: 'food', amount: 60, count: 1 }]);
	});

	it('keeps learned merchant rules per owner and counts only that owner’s avoided fallback calls', async () => {
		const accountA = await admit('Ulearn-a');
		const accountB = await admit('Ulearn-b');
		const userA = accountA.status === 'joined' ? accountA.user.id : 0;
		const userB = accountB.status === 'joined' ? accountB.user.id : 0;
		await db.insert(categories).values({ id: 'transport', nameTh: 'เดินทาง', nameEn: 'Transport', kind: 'expense', icon: '🚕', color: '#00f' }).onConflictDoNothing();
		const [ruleA] = await db.insert(userCategoryRules).values([
			{ userId: userA, keyword: 'grab', categoryId: 'transport' },
			{ userId: userB, keyword: 'grab', categoryId: 'food' }
		]).returning();
		const { findLearnedCategory, recordLearnedCategoryMatch } = await import('../src/lib/server/db/learned-categories');
		expect(await findLearnedCategory(userA, 'Grab 100', 'expense')).toMatchObject({ id: ruleA.id, categoryId: 'transport' });
		expect(await findLearnedCategory(userA, 'Grab 100', 'income')).toBeNull();
		await recordLearnedCategoryMatch(ruleA.id, userA, true);
		await recordLearnedCategoryMatch(ruleA.id, userB, true);
		const rules = await db.select().from(userCategoryRules);
		expect(rules.find((rule) => rule.id === ruleA.id)).toMatchObject({ matchCount: 1, savedLlmCalls: 1 });
		expect(rules).toHaveLength(2);
	});

	it('exports only the signed-in account across every owned table', async () => {
		const accountA = await admit('Uaccount-a', async () => 'คนเอ');
		const accountB = await admit('Uaccount-b', async () => 'คนบี');
		const userA = accountA.status === 'joined' ? accountA.user.id : 0;
		const userB = accountB.status === 'joined' ? accountB.user.id : 0;

		const [billA, billB] = await db.insert(bills).values([
			{ userId: userA, name: 'ค่าไฟ เอ', amount: '900.10', categoryId: 'food', paymentMethod: 'bank', recurrence: 'once', dueDate: new Date('2026-09-01T00:00:00Z') },
			{ userId: userB, name: 'ค่าไฟ บี', amount: '800.20', categoryId: 'food', paymentMethod: 'bank', recurrence: 'once', dueDate: new Date('2026-09-02T00:00:00Z') }
		]).returning();
		const [txA, txB] = await db.insert(transactions).values([
			{ userId: userA, kind: 'expense', amount: '60.25', categoryId: 'food', note: 'ข้าว เอ', occurredAt: new Date('2026-09-01T05:00:00Z'), source: 'line', parsedBy: 'rule', billId: billA.id },
			{ userId: userB, kind: 'expense', amount: '70.50', categoryId: 'food', note: 'ข้าว บี', occurredAt: new Date('2026-09-01T05:00:00Z'), source: 'line', parsedBy: 'rule', billId: billB.id }
		]).returning();
		await db.insert(billPayments).values([
			{ userId: userA, billId: billA.id, transactionId: txA.id, period: '2026-09', paidAt: new Date('2026-09-01T05:00:00Z') },
			{ userId: userB, billId: billB.id, transactionId: txB.id, period: '2026-09', paidAt: new Date('2026-09-01T05:00:00Z') }
		]);
		await db.insert(monthlyPlans).values([
			{ userId: userA, month: '2026-09', expectedIncome: '1000.10' },
			{ userId: userB, month: '2026-09', expectedIncome: '2000.20' }
		]);
		await db.insert(userCategoryRules).values([
			{ userId: userA, keyword: 'grab', categoryId: 'food', matchCount: 4, savedLlmCalls: 2 },
			{ userId: userB, keyword: 'shoppee', categoryId: 'food', matchCount: 9, savedLlmCalls: 8 }
		]);

		const { parseExportSelection } = await import('../src/lib/export');
		const { getPersonalExport } = await import('../src/lib/server/db/exports');
		const selection = parseExportSelection(new URLSearchParams('mode=range&from=2026-08-31&to=2026-09-30'));
		const exported = await getPersonalExport(userA, selection, new Date('2026-10-01T00:00:00Z'));

		expect(exported.account?.displayName).toBe('คนเอ');
		expect(exported.transactions.map((row) => row.note)).toEqual(['ข้าว เอ']);
		expect(exported.transactions.map((row) => row.id)).toEqual([txA.id]);
		expect(exported.bills.map((row) => row.name)).toEqual(['ค่าไฟ เอ']);
		expect(exported.bills.map((row) => row.id)).toEqual([billA.id]);
		const { getBill } = await import('../src/lib/server/db/bills');
		expect(await getBill(billB.id, userA)).toBeNull();
		expect(exported.bills[0]?.dueDate).toBe('2026-09-01');
		expect(exported.billPayments).toHaveLength(1);
		expect(exported.billPayments.map((row) => row.billId)).toEqual([billA.id]);
		expect(exported.billPayments.map((row) => row.transactionId)).toEqual([txA.id]);
		expect(exported.monthlyPlans.map((row) => row.expectedIncome)).toEqual(['1000.10']);
		expect(exported.learnedCategories.map((row) => row.keyword)).toEqual(['grab']);
		expect(JSON.stringify(exported)).not.toContain('คนบี');
		expect(JSON.stringify(exported)).not.toContain('70.50');
		expect(JSON.stringify(exported)).not.toContain('shoppee');
		const { billsCsv } = await import('../src/lib/export');
		expect(billsCsv(exported)).toContain('"2026-09-01"');
	});

	it('keeps credit card accounts private and does not count settlement twice', async () => {
		const accountA = await admit('Ucard-a');
		const accountB = await admit('Ucard-b');
		const userA = accountA.status === 'joined' ? accountA.user.id : 0;
		const userB = accountB.status === 'joined' ? accountB.user.id : 0;
		const [cardA, cardB] = await db.insert(creditCards).values([
			{ userId: userA, name: 'บัตรเอ', closingDay: 25, dueDay: 15, isDefault: true },
			{ userId: userB, name: 'บัตรบี', closingDay: 20, dueDay: 10, isDefault: true }
		]).returning();
		const [autoBill] = await db.insert(bills).values({
			userId: userA, name: 'ยอดบัตรเอ', amount: '400.00', categoryId: 'food', paymentMethod: 'bank',
			recurrence: 'once', dueDate: new Date('2026-09-15T02:00:00Z'), creditCardId: cardA.id, noExpenseOnPay: true
		}).returning();
		const [purchase, settlement] = await db.insert(transactions).values([
			{ userId: userA, kind: 'expense', amount: '400.00', categoryId: 'food', note: 'ซื้อด้วยบัตร', occurredAt: new Date('2026-09-01T05:00:00Z'), paymentMethod: 'credit_card', creditCardId: cardA.id, source: 'web', parsedBy: 'manual' },
			{ userId: userA, kind: 'expense', amount: '400.00', categoryId: 'food', note: 'จ่ายยอดบัตร', occurredAt: new Date('2026-09-15T05:00:00Z'), paymentMethod: 'bank', billId: autoBill.id, source: 'web', parsedBy: 'manual' }
		]).returning();
		const { getTotals, listTransactions } = await import('../src/lib/server/db/queries');
		const { getCreditCard } = await import('../src/lib/server/db/credit-cards');
		const { parseExportSelection } = await import('../src/lib/export');
		const { getPersonalExport } = await import('../src/lib/server/db/exports');
		const range = { from: new Date('2026-08-31T17:00:00Z'), to: new Date('2026-09-30T17:00:00Z') };
		const selection = parseExportSelection(new URLSearchParams('mode=range&from=2026-08-31&to=2026-09-30'));

		expect(await getCreditCard(cardA.id, userB)).toBeNull();
		expect((await getCreditCard(cardB.id, userB))?.name).toBe('บัตรบี');
		expect((await getTotals(userA, range)).expense).toBe(400);
		expect((await listTransactions(userA, range)).map((row) => row.id)).toEqual([purchase.id]);
		const exported = await getPersonalExport(userA, selection);
		expect(exported.transactions.map((row) => row.id)).toEqual([purchase.id]);
		expect(await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, settlement.id))).toHaveLength(1);
	});

	it('stores category budgets only under the selected account and month', async () => {
		const accountA = await admit('Ubudget-a');
		const accountB = await admit('Ubudget-b');
		const userA = accountA.status === 'joined' ? accountA.user.id : 0;
		const userB = accountB.status === 'joined' ? accountB.user.id : 0;
		const { getMonthlyCategoryBudgets, replaceMonthlyCategoryBudgets } = await import('../src/lib/server/db/plans');

		await replaceMonthlyCategoryBudgets(userA, '2026-09', [{ categoryId: 'food', amount: '6000.00' }, { categoryId: 'transport', amount: '0.00' }]);
		await replaceMonthlyCategoryBudgets(userB, '2026-09', [{ categoryId: 'food', amount: '2500.00' }]);
		expect(await getMonthlyCategoryBudgets(userA, '2026-10')).toEqual([]);
		expect((await getMonthlyCategoryBudgets(userA, '2026-09')).map((row) => row.amount)).toEqual(['6000.00']);
		expect((await getMonthlyCategoryBudgets(userB, '2026-09')).map((row) => row.amount)).toEqual(['2500.00']);
		expect(await db.select().from(monthlyCategoryBudgets).where(eq(monthlyCategoryBudgets.userId, userA))).toHaveLength(1);
	});

	it('keeps notification preferences isolated per account', async () => {
		const accountA = await admit('Unotify-a');
		const accountB = await admit('Unotify-b');
		const userA = accountA.status === 'joined' ? accountA.user.id : 0;
		const userB = accountB.status === 'joined' ? accountB.user.id : 0;
		const changed = await updateNotificationPreferences(userA, {
			notificationsEnabled: false,
			notificationHour: 20,
			timezone: 'Asia/Bangkok',
			quietHoursStart: 23,
			quietHoursEnd: 8,
			billReminderDaysBefore: 5
		});
		const [unchanged] = await db.select().from(users).where(eq(users.id, userB));

		expect(changed?.notificationsEnabled).toBe(false);
		expect(changed?.notificationHour).toBe(20);
		expect(changed?.billReminderDaysBefore).toBe(5);
		expect(unchanged?.notificationsEnabled).toBe(true);
		expect(unchanged?.notificationHour).toBe(18);
		expect(unchanged?.quietHoursStart).toBe(22);
		expect(unchanged?.billReminderDaysBefore).toBe(3);
	});
});
