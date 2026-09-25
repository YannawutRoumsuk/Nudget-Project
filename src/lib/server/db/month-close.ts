import { and, eq } from 'drizzle-orm';
import { addMonths, bangkokMonthKey, bangkokParts, fromBangkok } from '$lib/utils/date';
import { db } from './index';
import { bills, monthClosures, monthlyCategoryBudgets, monthlyPlans } from './schema';
import type { BillView } from './bills';
import type { MonthCloseCarryover, MonthCloseSnapshot } from './schema';

export interface MonthCloseInput {
	userId: number;
	month: string;
	nextMonth: string;
	snapshot: MonthCloseSnapshot;
	carryoverMode: MonthCloseCarryover;
	carryoverAmount: number;
	plan: Omit<typeof monthlyPlans.$inferInsert, 'userId' | 'month' | 'updatedAt'> | null;
	budgets: Array<{ categoryId: string; amount: string }>;
	unpaidBills: BillView[];
}

export type MonthCloseResult = { status: 'closed'; carriedBillCount: number } | { status: 'refreshed'; carriedBillCount: number };

/** Close exactly once; later refreshes update the review snapshot without replaying copies. */
export async function closeMonth(input: MonthCloseInput): Promise<MonthCloseResult> {
	return db.transaction(async (tx) => {
		const existing = await tx.select().from(monthClosures)
			.where(and(eq(monthClosures.userId, input.userId), eq(monthClosures.month, input.month))).limit(1);
		if (existing.length) {
			const closure = existing[0];
			await tx.update(monthClosures).set({
				snapshot: input.snapshot,
				carryoverAmount: closure.carryoverMode === 'none' ? '0.00' : Math.max(0, input.carryoverAmount).toFixed(2),
				updatedAt: new Date()
			})
				.where(and(eq(monthClosures.userId, input.userId), eq(monthClosures.month, input.month)));
			return { status: 'refreshed', carriedBillCount: existing[0].carriedBillCount };
		}

		const [claimed] = await tx.insert(monthClosures).values({
			userId: input.userId,
			month: input.month,
			snapshot: input.snapshot,
			carryoverMode: input.carryoverMode,
			carryoverAmount: input.carryoverMode === 'none' ? '0.00' : Math.max(0, input.carryoverAmount).toFixed(2),
			copiedPlan: Boolean(input.plan),
			copiedBudgets: input.budgets.length > 0,
			carriedBillCount: 0
		}).onConflictDoNothing().returning({ month: monthClosures.month });
		if (!claimed) {
			const [raced] = await tx.select().from(monthClosures)
				.where(and(eq(monthClosures.userId, input.userId), eq(monthClosures.month, input.month))).limit(1);
			if (raced) {
				await tx.update(monthClosures).set({
					snapshot: input.snapshot,
					carryoverAmount: raced.carryoverMode === 'none' ? '0.00' : Math.max(0, input.carryoverAmount).toFixed(2),
					updatedAt: new Date()
				})
					.where(and(eq(monthClosures.userId, input.userId), eq(monthClosures.month, input.month)));
				return { status: 'refreshed', carriedBillCount: raced.carriedBillCount };
			}
			throw new Error('Could not create month close record');
		}

		if (input.plan) await tx.insert(monthlyPlans).values({
			...input.plan, userId: input.userId, month: input.nextMonth, updatedAt: new Date()
		}).onConflictDoUpdate({
			target: [monthlyPlans.userId, monthlyPlans.month],
			set: { ...input.plan, updatedAt: new Date() }
		});

		if (input.budgets.length) {
			await tx.delete(monthlyCategoryBudgets).where(and(
				eq(monthlyCategoryBudgets.userId, input.userId), eq(monthlyCategoryBudgets.month, input.nextMonth)
			));
			await tx.insert(monthlyCategoryBudgets).values(input.budgets.map((row) => ({ ...row, userId: input.userId, month: input.nextMonth })));
		}

		const targetParts = input.nextMonth.split('-').map(Number);
		const [targetYear, targetMonthNumber] = targetParts;
		let carriedBillCount = 0;
		for (const bill of input.unpaidBills) {
			if (bill.recurrence !== 'once' || bill.noExpenseOnPay || bill.creditInstallmentId !== null || !bill.dueDate) continue;
			const sourceDay = bangkokParts(bill.dueDate).day;
			const lastDay = new Date(Date.UTC(targetYear, targetMonthNumber, 0)).getUTCDate();
			// PostgreSQL DATE is a calendar date, so keep noon UTC to preserve the same
			// YYYY-MM-DD when Drizzle serializes the JavaScript Date.
			const dueDate = new Date(Date.UTC(targetYear, targetMonthNumber - 1, Math.min(sourceDay, lastDay), 12));
			const moved = await tx.update(bills).set({ dueDate, updatedAt: new Date() })
				.where(and(eq(bills.id, bill.id), eq(bills.userId, input.userId), eq(bills.active, true)))
				.returning({ id: bills.id });
			if (moved.length) carriedBillCount += 1;
		}
		if (carriedBillCount) await tx.update(monthClosures).set({ carriedBillCount })
			.where(and(eq(monthClosures.userId, input.userId), eq(monthClosures.month, input.month)));
		return { status: 'closed', carriedBillCount };
	});
}

export async function getMonthClosure(userId: number, month: string) {
	const [row] = await db.select().from(monthClosures)
		.where(and(eq(monthClosures.userId, userId), eq(monthClosures.month, month))).limit(1);
	return row ?? null;
}

export function previousMonthKey(month: string): string {
	const [year, monthNumber] = month.split('-').map(Number);
	return bangkokMonthKey(addMonths(fromBangkok(year, monthNumber, 1), -1));
}
