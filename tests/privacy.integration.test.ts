import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { users } from '../src/lib/server/db/schema';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const ownerLineId = 'Uprivacy-owner';
const targetLineId = 'Uprivacy-target';
const otherLineId = 'Uprivacy-other';
if (url) {
	process.env.DATABASE_URL = url;
	process.env.LINE_ALLOWED_USER_ID = ownerLineId;
}

suite('account deletion against PostgreSQL', async () => {
	const { deleteOwnAccount } = await import('../src/lib/server/db/privacy');
	const { closeDatabase, db } = await import('../src/lib/server/db');
	const {
		adminAuditLogs, aiConversations, billPayments, bills, categories, creditCards, creditInstallments, monthClosures,
		feedback, insights, llmQuota, llmUsage, monthlyCategoryBudgets, monthlyPlans, pendingSlips, savingsGoalContributions, savingsGoals, recurringDecisions,
		releaseDeliveries, reminderDeliveries, transactions, userCategoryRules, whatIfScenarios
	} = await import('../src/lib/server/db/schema');
	let ownerId = 0;
	let targetId = 0;
	let otherId = 0;

	beforeEach(async () => {
		await db.delete(users).where(inArray(users.lineUserId, [ownerLineId, targetLineId, otherLineId]));
		await db.insert(categories).values({ id: 'food', nameTh: 'อาหาร', nameEn: 'Food', kind: 'expense', icon: '🍜', color: '#f00' }).onConflictDoNothing();
		const seeded = await db.insert(users).values([
			{ lineUserId: ownerLineId, displayName: 'เจ้าของ' },
			{ lineUserId: targetLineId, displayName: 'เจ้าของบัญชี' },
			{ lineUserId: otherLineId, displayName: 'บัญชีอื่น' }
		]).returning();
		ownerId = seeded[0].id;
		targetId = seeded[1].id;
		otherId = seeded[2].id;
	});

	afterAll(async () => closeDatabase());

	it('cannot delete another member by supplying their database id', async () => {
		expect(await deleteOwnAccount(targetId, otherLineId)).toBe('not_found');
		expect((await db.select().from(users).where(eqUser(targetId))).length).toBe(1);
	});

	it('protects configured owners until ownership has been transferred and their allowlist entry removed', async () => {
		expect(await deleteOwnAccount(ownerId, ownerLineId)).toBe('owner_protected');
		expect((await db.select().from(users).where(eqUser(ownerId))).length).toBe(1);
	});

	it('permanently cascades all account-owned financial, feedback, OCR, AI and audit data', async () => {
		const [card] = await db.insert(creditCards).values({ userId: targetId, name: 'บัตร', closingDay: 20, dueDay: 5 }).returning();
		const [bill] = await db.insert(bills).values({ userId: targetId, name: 'ค่าเน็ต', amount: '500.00', categoryId: 'food', paymentMethod: 'bank', recurrence: 'monthly', dueDay: 10 }).returning();
		const [tx] = await db.insert(transactions).values({ userId: targetId, kind: 'expense', amount: '60.00', categoryId: 'food', note: 'ข้าว', occurredAt: new Date('2026-09-01T05:00:00Z'), source: 'web', parsedBy: 'manual' }).returning();
		await db.insert(billPayments).values({ userId: targetId, billId: bill.id, transactionId: tx.id, period: '2026-09' });
		await db.insert(creditInstallments).values({ userId: targetId, creditCardId: card.id, purchaseTransactionId: tx.id, name: 'ผ่อนของ', categoryId: 'food', totalAmount: '600.00', installmentAmount: '100.00', totalInstallments: 6, firstDueDate: new Date('2026-10-01T00:00:00Z') });
		await db.insert(monthlyPlans).values({ userId: targetId, month: '2026-09', expectedIncome: '30000.00' });
		await db.insert(monthlyCategoryBudgets).values({ userId: targetId, month: '2026-09', categoryId: 'food', amount: '6000.00' });
		await db.insert(monthClosures).values({ userId: targetId, month: '2026-08', snapshot: { income: 30000, expense: 12000, remaining: 8000, unpaidBills: 0, unpaidBillCount: 0, categorySpend: [], refreshedAt: '2026-09-01T00:00:00.000Z' }, carryoverMode: 'spendable', carryoverAmount: '8000.00' });
		await db.insert(pendingSlips).values({ userId: targetId, lineUserId: targetLineId, messageId: 'slip-message', status: 'queued', categoryId: 'food' });
		await db.insert(reminderDeliveries).values({ userId: targetId, key: 'reminder:one' });
		await db.insert(feedback).values({ userId: targetId, lineUserId: targetLineId, displayName: 'เจ้าของบัญชี', message: 'ลบทิ้งด้วย' });
		await db.insert(aiConversations).values({ userId: targetId, userMessage: 'ถาม', assistantMessage: 'ตอบ', provider: 'gemini', model: 'test' });
		await db.insert(insights).values({ userId: targetId, month: '2026-09', fingerprint: 'f'.repeat(64), payload: '{}' });
		await db.insert(llmQuota).values({ userId: targetId, day: '2026-09-01' });
		await db.insert(llmUsage).values({ userId: targetId, workflow: 'parser', provider: 'gemini', model: 'test', success: true });
		await db.insert(releaseDeliveries).values({ userId: targetId, version: '1.0.0' });
		await db.insert(userCategoryRules).values({ userId: targetId, keyword: 'grab', categoryId: 'food' });
		await db.insert(whatIfScenarios).values({ userId: targetId, month: '2026-09', name: 'draft', changes: [{ type: 'savings', amount: 1000 }] });
		const [goal] = await db.insert(savingsGoals).values({ userId: targetId, name: 'ทริป', targetAmount: '10000.00' }).returning();
		await db.insert(savingsGoalContributions).values({ userId: targetId, goalId: goal.id, amount: '500.00' });
		await db.insert(recurringDecisions).values({ userId: targetId, merchantKey: 'netflix', status: 'dismissed' });
		await db.insert(adminAuditLogs).values({ actorUserId: ownerId, actorLineUserId: ownerLineId, targetUserId: targetId, action: 'update', entity: 'member_note', entityId: String(targetId), changes: { before: '', after: 'note' } });

		expect(await deleteOwnAccount(targetId, targetLineId)).toBe('deleted');
		expect((await db.select().from(users).where(eqUser(targetId))).length).toBe(0);
		const ownedRows = await Promise.all([
			db.select().from(transactions).where(userEquals(transactions.userId, targetId)),
			db.select().from(bills).where(userEquals(bills.userId, targetId)),
			db.select().from(billPayments).where(userEquals(billPayments.userId, targetId)),
			db.select().from(creditCards).where(userEquals(creditCards.userId, targetId)),
			db.select().from(creditInstallments).where(userEquals(creditInstallments.userId, targetId)),
			db.select().from(monthlyPlans).where(userEquals(monthlyPlans.userId, targetId)),
			db.select().from(monthlyCategoryBudgets).where(userEquals(monthlyCategoryBudgets.userId, targetId)),
			db.select().from(monthClosures).where(userEquals(monthClosures.userId, targetId)),
			db.select().from(pendingSlips).where(userEquals(pendingSlips.userId, targetId)),
			db.select().from(reminderDeliveries).where(userEquals(reminderDeliveries.userId, targetId)),
			db.select().from(feedback).where(userEquals(feedback.userId, targetId)),
			db.select().from(aiConversations).where(userEquals(aiConversations.userId, targetId)),
			db.select().from(insights).where(userEquals(insights.userId, targetId)),
			db.select().from(llmQuota).where(userEquals(llmQuota.userId, targetId)),
			db.select().from(llmUsage).where(userEquals(llmUsage.userId, targetId)),
			db.select().from(userCategoryRules).where(userEquals(userCategoryRules.userId, targetId)),
			db.select().from(whatIfScenarios).where(userEquals(whatIfScenarios.userId, targetId)),
			db.select().from(savingsGoals).where(userEquals(savingsGoals.userId, targetId)),
			db.select().from(savingsGoalContributions).where(userEquals(savingsGoalContributions.userId, targetId)),
			db.select().from(recurringDecisions).where(userEquals(recurringDecisions.userId, targetId)),
			db.select().from(releaseDeliveries).where(userEquals(releaseDeliveries.userId, targetId)),
			db.select().from(adminAuditLogs).where(userEquals(adminAuditLogs.targetUserId, targetId))
		]);
		expect(ownedRows.every((rows) => rows.length === 0)).toBe(true);
		expect((await db.select().from(users).where(eqUser(otherId))).length).toBe(1);
	});
});

function eqUser(id: number) {
	return eq(users.id, id);
}

function userEquals(column: unknown, id: number) {
	return eq(column as typeof users.id, id);
}
