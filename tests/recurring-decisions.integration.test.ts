import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { users } from '../src/lib/server/db/schema';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const lineIds = ['Urecurring-one', 'Urecurring-two'];
if (url) process.env.DATABASE_URL = url;

suite('recurring decisions against PostgreSQL', async () => {
	const { confirmRecurringCandidate, decideRecurringCandidate, getRecurringDecisions, restoreRecurringCandidate } = await import('../src/lib/server/db/recurring-decisions');
	const { closeDatabase, db } = await import('../src/lib/server/db');
	const { categories, recurringDecisions, bills } = await import('../src/lib/server/db/schema');
	let firstUser = 0;
	let secondUser = 0;
	const candidate = {
		merchantKey: 'stream service', name: 'Stream service', amount: 299, categoryId: 'bills', dueDay: 5, cycleDays: 30,
		occurrences: 3, monthlyTotal: 299, yearlyTotal: 3588, firstSeen: new Date('2026-07-05T00:00:00Z'), lastSeen: new Date('2026-09-05T00:00:00Z'),
		paymentMethod: 'bank', creditCardId: null
	};

	beforeEach(async () => {
		await db.delete(users).where(inArray(users.lineUserId, lineIds));
		await db.insert(categories).values({ id: 'bills', nameTh: 'บิล', nameEn: 'Bills', kind: 'expense', icon: '🧾', color: '#f00' }).onConflictDoNothing();
		const inserted = await db.insert(users).values(lineIds.map((lineUserId) => ({ lineUserId }))).returning();
		firstUser = inserted[0].id;
		secondUser = inserted[1].id;
	});
	afterAll(async () => {
		await db.delete(users).where(inArray(users.lineUserId, lineIds));
		await closeDatabase();
	});

	it('creates one bill only after confirmation, scoped per account, and cascades decisions on account deletion', async () => {
		const accepted = await Promise.all([confirmRecurringCandidate(firstUser, candidate), confirmRecurringCandidate(firstUser, candidate)]);
		expect(accepted.filter(Boolean)).toHaveLength(1);
		const [ownDecision] = await getRecurringDecisions(firstUser);
		expect(ownDecision).toMatchObject({ merchantKey: candidate.merchantKey, status: 'confirmed', billName: candidate.name, billAmount: '299.00', billActive: true });
		expect(await getRecurringDecisions(secondUser)).toEqual([]);
		expect(await confirmRecurringCandidate(secondUser, candidate)).not.toBeNull();
		expect(await db.select().from(bills).where(eq(bills.userId, firstUser))).toHaveLength(1);
		expect(await db.select().from(bills).where(eq(bills.userId, secondUser))).toHaveLength(1);
		await db.delete(users).where(eq(users.id, firstUser));
		expect(await db.select().from(recurringDecisions).where(eq(recurringDecisions.userId, firstUser))).toEqual([]);
	});

	it('remembers a dismissed suggestion until the owner restores it', async () => {
		await decideRecurringCandidate(firstUser, candidate.merchantKey, 'not_recurring');
		expect((await getRecurringDecisions(firstUser))[0].status).toBe('not_recurring');
		expect(await restoreRecurringCandidate(secondUser, candidate.merchantKey)).toBe(false);
		expect(await restoreRecurringCandidate(firstUser, candidate.merchantKey)).toBe(true);
		expect(await getRecurringDecisions(firstUser)).toEqual([]);
	});
});
