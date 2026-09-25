import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const adminLineId = 'Uissue22-admin';
const targetLineId = 'Uissue22-target';
const otherLineId = 'Uissue22-other';
if (url) {
	process.env.DATABASE_URL = url;
	process.env.LINE_ALLOWED_USER_ID = adminLineId;
}

suite('owner support member mode', async () => {
	const { actions, load } = await import('../src/routes/members/[id]/+page.server');
	const { closeDatabase, db } = await import('../src/lib/server/db');
	const { adminAuditLogs, bills, categories, monthlyCategoryBudgets, monthlyPlans, transactions, users } = await import('../src/lib/server/db/schema');
	const { deleteMemberCategoryBudget, deleteMemberTransaction, getAdminMemberDetail, saveMemberCategoryBudget, saveMemberNote, saveMemberPlan, updateMemberBill, updateMemberTransaction } = await import('../src/lib/server/db/admin');
	let actorId = 0;
	let targetId = 0;
	let otherId = 0;

	beforeEach(async () => {
		await db.delete(users).where(inArray(users.lineUserId, [adminLineId, targetLineId, otherLineId]));
		await db.insert(categories).values({ id: 'food', nameTh: 'อาหาร', nameEn: 'Food', kind: 'expense', icon: '🍜', color: '#f00' }).onConflictDoNothing();
		const seeded = await db.insert(users).values([
			{ lineUserId: adminLineId, displayName: 'เจ้าของ' },
			{ lineUserId: targetLineId, displayName: 'สมาชิกที่เลือก' },
			{ lineUserId: otherLineId, displayName: 'สมาชิกอื่น' }
		]).returning();
		actorId = seeded[0].id;
		targetId = seeded[1].id;
		otherId = seeded[2].id;
	});

	afterAll(async () => closeDatabase());

	it('blocks a normal member from the page and its note action', async () => {
		const normalLocals = { userId: otherId, lineUserId: otherLineId };
		await expect(load({ locals: normalLocals, params: { id: String(targetId) } } as never)).rejects.toMatchObject({ status: 403 });
		await expect(actions.saveNote!({
			locals: normalLocals,
			params: { id: String(targetId) },
			request: new Request('http://localhost/members/1', { method: 'POST', body: new URLSearchParams({ note: 'แก้ไม่ได้' }) })
		} as never)).rejects.toMatchObject({ status: 403 });
	});

	it('loads only the selected account without replacing the owner session', async () => {
		await db.insert(transactions).values([
			{ userId: targetId, kind: 'expense', amount: '60.00', categoryId: 'food', note: 'ข้าวของสมาชิก', occurredAt: new Date('2026-09-01T05:00:00Z'), source: 'web', parsedBy: 'manual' },
			{ userId: otherId, kind: 'expense', amount: '9000.00', categoryId: 'food', note: 'ข้อมูลอีกคน', occurredAt: new Date('2026-09-01T05:00:00Z'), source: 'web', parsedBy: 'manual' }
		]);
		const page = await load({ locals: { userId: actorId, lineUserId: adminLineId }, params: { id: String(targetId) } } as never) as {
			member: { displayName: string };
			transactions: Array<{ note: string }>;
		};
		expect(page.member.displayName).toBe('สมาชิกที่เลือก');
		expect(page.transactions.map((row) => row.note)).toEqual(['ข้าวของสมาชิก']);
		expect(JSON.stringify(page)).not.toContain('ข้อมูลอีกคน');
	});

	it('audits notes, edits, deletes, bills and plans atomically and refuses cross-account record ids', async () => {
		const [tx, foreignTx] = await db.insert(transactions).values([
			{ userId: targetId, kind: 'expense', amount: '60.00', categoryId: 'food', note: 'ก่อนแก้', occurredAt: new Date('2026-09-01T05:00:00Z'), source: 'web', parsedBy: 'manual' },
			{ userId: otherId, kind: 'expense', amount: '90.00', categoryId: 'food', note: 'ของคนอื่น', occurredAt: new Date('2026-09-02T05:00:00Z'), source: 'web', parsedBy: 'manual' }
		]).returning();
		const [bill] = await db.insert(bills).values({ userId: targetId, name: 'ค่าเน็ต', amount: '500.00', categoryId: 'food', paymentMethod: 'bank', recurrence: 'monthly', dueDay: 10 }).returning();

		await saveMemberNote({ userId: actorId, lineUserId: adminLineId }, targetId, 'ติดต่อทาง LINE');
		await updateMemberTransaction({ userId: actorId, lineUserId: adminLineId }, targetId, tx.id, { amount: '70.00', note: 'แก้แล้ว' });
		expect(await updateMemberTransaction({ userId: actorId, lineUserId: adminLineId }, targetId, foreignTx.id, { note: 'ห้ามข้ามบัญชี' })).toBeNull();
		expect(await deleteMemberTransaction({ userId: actorId, lineUserId: adminLineId }, targetId, foreignTx.id)).toBe(false);
		await updateMemberBill({ userId: actorId, lineUserId: adminLineId }, targetId, bill.id, { amount: '550.00', name: 'ค่าเน็ตแก้แล้ว' });
		await saveMemberPlan({ userId: actorId, lineUserId: adminLineId }, targetId, {
			month: '2026-09', expectedIncome: '30000.00', expectedIncomeDay: 25, savingsGoal: '3000.00', foodDailyBudget: '250.00',
			commuteDailyBudget: '100.00', commuteDays: 20, budgetAlertsEnabled: true
		});
		await saveMemberCategoryBudget({ userId: actorId, lineUserId: adminLineId }, targetId, { month: '2026-09', categoryId: 'food', amount: '6000.00' });
		await deleteMemberCategoryBudget({ userId: actorId, lineUserId: adminLineId }, targetId, '2026-09', 'food');

		const detail = await getAdminMemberDetail(targetId);
		const rows = await db.select().from(adminAuditLogs).where(inArray(adminAuditLogs.targetUserId, [targetId, otherId]));
		expect(detail?.member.memberNote).toBe('ติดต่อทาง LINE');
		expect(detail?.transactions.find((row) => row.id === tx.id)?.amount).toBe('70.00');
		expect(detail?.transactions.some((row) => row.id === foreignTx.id)).toBe(false);
		expect(detail?.bills[0]?.amount).toBe('550.00');
		expect(detail?.categoryBudgets).toHaveLength(0);
		expect(rows).toHaveLength(6);
		expect(rows.every((row) => row.targetUserId === targetId && row.actorUserId === actorId && row.actorLineUserId === adminLineId)).toBe(true);
		expect(rows.find((row) => row.entity === 'transaction')?.changes).toMatchObject({ before: { transaction: { amount: '60.00' } }, after: { transaction: { amount: '70.00' } } });
		expect((await db.select().from(monthlyPlans).where(inArray(monthlyPlans.userId, [targetId, otherId])))).toHaveLength(1);
		expect((await db.select().from(monthlyCategoryBudgets).where(inArray(monthlyCategoryBudgets.userId, [targetId, otherId])))).toHaveLength(0);
	});
});
