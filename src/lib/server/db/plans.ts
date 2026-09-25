import { and, asc, eq } from 'drizzle-orm';
import { db } from './index';
import { monthlyCategoryBudgets, monthlyPlans } from './schema';
import type { MonthlyCategoryBudget, MonthlyPlan } from './schema';

export async function getMonthlyPlan(userId: number, month: string): Promise<MonthlyPlan | null> {
	const [row] = await db
		.select()
		.from(monthlyPlans)
		.where(and(eq(monthlyPlans.userId, userId), eq(monthlyPlans.month, month)))
		.limit(1);
	return row ?? null;
}

export async function saveMonthlyPlan(values: Omit<typeof monthlyPlans.$inferInsert, 'updatedAt'>): Promise<MonthlyPlan> {
	const [row] = await db
		.insert(monthlyPlans)
		.values(values)
		.onConflictDoUpdate({
			target: [monthlyPlans.userId, monthlyPlans.month],
			set: { ...values, updatedAt: new Date() }
		})
		.returning();
	return row;
}

export async function getMonthlyCategoryBudgets(userId: number, month: string): Promise<MonthlyCategoryBudget[]> {
	return db.select().from(monthlyCategoryBudgets)
		.where(and(eq(monthlyCategoryBudgets.userId, userId), eq(monthlyCategoryBudgets.month, month)))
		.orderBy(asc(monthlyCategoryBudgets.categoryId));
}

/** Replace one owner's monthly budget rows atomically; zero means no budget for that category. */
export async function replaceMonthlyCategoryBudgets(
	userId: number,
	month: string,
	values: Array<{ categoryId: string; amount: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.delete(monthlyCategoryBudgets).where(and(
			eq(monthlyCategoryBudgets.userId, userId), eq(monthlyCategoryBudgets.month, month)
		));
		const rows = values.filter((item) => Number(item.amount) > 0)
			.map((item) => ({ ...item, userId, month }));
		if (rows.length) await tx.insert(monthlyCategoryBudgets).values(rows);
	});
}
