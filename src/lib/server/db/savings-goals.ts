import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './index';
import { savingsGoalContributions, savingsGoals } from './schema';
import type { SavingsGoalStatus } from './schema';

export async function listSavingsGoals(userId: number) {
	return db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId))
		.orderBy(savingsGoals.priority, desc(savingsGoals.updatedAt));
}

export async function listGoalContributions(userId: number) {
	return db.select({ id: savingsGoalContributions.id, goalId: savingsGoalContributions.goalId,
		goalName: savingsGoals.name, amount: savingsGoalContributions.amount, createdAt: savingsGoalContributions.createdAt })
		.from(savingsGoalContributions).innerJoin(savingsGoals, eq(savingsGoals.id, savingsGoalContributions.goalId))
		.where(eq(savingsGoalContributions.userId, userId)).orderBy(desc(savingsGoalContributions.createdAt)).limit(30);
}

export async function createSavingsGoal(input: {
	userId: number; name: string; targetAmount: string; currentAmount: string; targetDate: Date | null;
	monthlyContribution: string; priority: number;
}) {
	return db.insert(savingsGoals).values({ ...input, status: Number(input.currentAmount) >= Number(input.targetAmount) ? 'completed' : 'active' }).returning();
}

export async function updateSavingsGoal(userId: number, id: number, input: {
	name: string; targetAmount: string; targetDate: Date | null; monthlyContribution: string; priority: number;
}) {
	return db.update(savingsGoals).set({ ...input,
		status: sql`case when ${savingsGoals.currentAmount} >= ${input.targetAmount}::numeric then 'completed' else ${savingsGoals.status} end`,
		updatedAt: new Date() })
		.where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.id, id), sql`${savingsGoals.status} in ('active', 'paused')`,
			sql`${input.targetAmount}::numeric >= ${savingsGoals.currentAmount}`)).returning();
}

export async function setSavingsGoalStatus(userId: number, id: number, status: SavingsGoalStatus) {
	return db.update(savingsGoals).set({ status, updatedAt: new Date() })
		.where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.id, id), sql`${savingsGoals.status} <> 'completed'`)).returning();
}

/** Add a contribution and its audit row atomically; the account total is never an expense. */
export async function addSavingsGoalContribution(userId: number, id: number, amount: string) {
	return db.transaction(async (tx) => {
		const rows = await tx.update(savingsGoals).set({
			currentAmount: sql`${savingsGoals.currentAmount} + ${amount}::numeric`,
			status: sql`case when ${savingsGoals.currentAmount} + ${amount}::numeric >= ${savingsGoals.targetAmount} then 'completed' else ${savingsGoals.status} end`,
			updatedAt: new Date()
		}).where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.id, id), eq(savingsGoals.status, 'active'),
			sql`${savingsGoals.currentAmount} + ${amount}::numeric <= ${savingsGoals.targetAmount}`)).returning();
		if (!rows[0]) return false;
		await tx.insert(savingsGoalContributions).values({ userId, goalId: id, amount });
		return true;
	});
}
