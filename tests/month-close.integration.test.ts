import { afterAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { fromBangkok } from '../src/lib/utils/date';
import { toNumber } from '../src/lib/utils/money';
import { users } from '../src/lib/server/db/schema';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const lineId = 'Umonth-close-integration';
if (url) process.env.DATABASE_URL = url;

suite('monthly close against PostgreSQL', async () => {
	const { closeMonth, getMonthClosure } = await import('../src/lib/server/db/month-close');
	const { getMonthlyCategoryBudgets, getMonthlyPlan } = await import('../src/lib/server/db/plans');
	const { listBills } = await import('../src/lib/server/db/bills');
	const { closeDatabase, db } = await import('../src/lib/server/db');
	const { bills, categories, monthClosures } = await import('../src/lib/server/db/schema');
	afterAll(async () => {
		await db.delete(users).where(eq(users.lineUserId, lineId));
		await closeDatabase();
	});

	it('copies selected plan, budgets and unpaid one-off bills once; refresh updates summary only', async () => {
		await db.delete(users).where(eq(users.lineUserId, lineId));
		await db.insert(categories).values({ id: 'food', nameTh: 'อาหาร', nameEn: 'Food', kind: 'expense', icon: '🍜', color: '#f00' }).onConflictDoNothing();
		const [user] = await db.insert(users).values({ lineUserId: lineId, displayName: 'Month close' }).returning();
		const sourcePlan = { userId: user.id, month: '2026-07', expectedIncome: '30000.00', savingsGoal: '5000.00', foodDailyBudget: '250.00', commuteDailyBudget: '100.00', commuteDays: 20, budgetAlertsEnabled: true };
		await db.insert((await import('../src/lib/server/db/schema')).monthlyPlans).values(sourcePlan);
		await db.insert((await import('../src/lib/server/db/schema')).monthlyCategoryBudgets).values({ userId: user.id, month: '2026-07', categoryId: 'food', amount: '7000.00' });
		await db.insert(bills).values({ userId: user.id, name: 'ค่าน้ำค้างจ่าย', amount: '450.00', categoryId: 'food', paymentMethod: 'bank', recurrence: 'once', dueDate: new Date(Date.UTC(2026, 6, 5, 12)), active: true });
		const closeInput = {
			userId: user.id, month: '2026-07', nextMonth: '2026-08',
			snapshot: { income: 30000, expense: 12000, remaining: 8000, unpaidBills: 450, unpaidBillCount: 1, categorySpend: [{ categoryId: 'food', amount: 5000 }], refreshedAt: '2026-08-01T00:00:00.000Z' },
			carryoverMode: 'spendable' as const, carryoverAmount: 8000,
			plan: {
				expectedIncome: sourcePlan.expectedIncome, savingsGoal: sourcePlan.savingsGoal, foodDailyBudget: sourcePlan.foodDailyBudget,
				commuteDailyBudget: sourcePlan.commuteDailyBudget, commuteDays: sourcePlan.commuteDays, budgetAlertsEnabled: sourcePlan.budgetAlertsEnabled
			},
			budgets: [{ categoryId: 'food', amount: '7000.00' }],
			unpaidBills: await listBills(user.id, fromBangkok(2026, 7, 1))
		};
		expect(await closeMonth(closeInput)).toEqual({ status: 'closed', carriedBillCount: 1 });
		expect((await getMonthlyPlan(user.id, '2026-08'))?.expectedIncome).toBe('30000.00');
		expect((await getMonthlyCategoryBudgets(user.id, '2026-08')).map((row) => row.amount)).toEqual(['7000.00']);
		const carriedBill = (await listBills(user.id, fromBangkok(2026, 8, 1))).find((bill) => bill.recurrence === 'once');
		expect(carriedBill).toBeDefined();
		expect(carriedBill?.dueDate?.toISOString().slice(0, 10)).toBe('2026-08-05');
		expect(toNumber((await getMonthClosure(user.id, '2026-07'))?.carryoverAmount ?? 0)).toBe(8000);

		const refreshed = { ...closeInput, carryoverAmount: 6500, plan: { ...closeInput.plan, expectedIncome: '31000.00' }, budgets: [{ categoryId: 'food', amount: '9000.00' }], snapshot: { ...closeInput.snapshot, income: 31000, remaining: 6500, refreshedAt: '2026-08-02T00:00:00.000Z' } };
		expect(await closeMonth(refreshed)).toEqual({ status: 'refreshed', carriedBillCount: 1 });
		expect((await getMonthlyPlan(user.id, '2026-08'))?.expectedIncome).toBe('30000.00');
		expect((await getMonthlyCategoryBudgets(user.id, '2026-08')).map((row) => row.amount)).toEqual(['7000.00']);
		expect((await listBills(user.id, fromBangkok(2026, 8, 1))).filter((bill) => bill.recurrence === 'once')).toHaveLength(1);
		expect((await getMonthClosure(user.id, '2026-07'))?.snapshot.income).toBe(31000);
		expect(toNumber((await getMonthClosure(user.id, '2026-07'))?.carryoverAmount ?? 0)).toBe(6500);
		const rows = await db.select().from(monthClosures).where(and(eq(monthClosures.userId, user.id), eq(monthClosures.month, '2026-07')));
		expect(rows).toHaveLength(1);
	});
});
