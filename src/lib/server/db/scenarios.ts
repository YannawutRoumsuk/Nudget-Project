import { and, desc, eq } from 'drizzle-orm';
import { db } from './index';
import { monthlyCategoryBudgets, monthlyPlans, whatIfScenarios } from './schema';

export async function listWhatIfScenarios(userId: number, month: string) {
	return db.select().from(whatIfScenarios)
		.where(and(eq(whatIfScenarios.userId, userId), eq(whatIfScenarios.month, month)))
		.orderBy(desc(whatIfScenarios.updatedAt), desc(whatIfScenarios.id)).limit(30);
}

export async function getWhatIfScenario(id: number, userId: number) {
	const [row] = await db.select().from(whatIfScenarios)
		.where(and(eq(whatIfScenarios.id, id), eq(whatIfScenarios.userId, userId))).limit(1);
	return row ?? null;
}

export async function saveWhatIfScenario(userId: number, month: string, name: string, changes: unknown[], id?: number) {
	if (id) {
		const [row] = await db.update(whatIfScenarios).set({ month, name, changes, updatedAt: new Date() })
			.where(and(eq(whatIfScenarios.id, id), eq(whatIfScenarios.userId, userId))).returning();
		return row ?? null;
	}
	const [row] = await db.insert(whatIfScenarios).values({ userId, month, name, changes }).returning();
	return row;
}

export async function deleteWhatIfScenario(id: number, userId: number): Promise<boolean> {
	const rows = await db.delete(whatIfScenarios)
		.where(and(eq(whatIfScenarios.id, id), eq(whatIfScenarios.userId, userId))).returning({ id: whatIfScenarios.id });
	return rows.length > 0;
}

export async function applyWhatIfPlan(values: Omit<typeof monthlyPlans.$inferInsert, 'updatedAt'>, budgets?: Array<{ categoryId: string; amount: string }>) {
	await db.transaction(async (tx) => {
		await tx.insert(monthlyPlans).values(values).onConflictDoUpdate({
			target: [monthlyPlans.userId, monthlyPlans.month], set: { ...values, updatedAt: new Date() }
		});
		if (budgets) {
			await tx.delete(monthlyCategoryBudgets).where(and(
				eq(monthlyCategoryBudgets.userId, values.userId), eq(monthlyCategoryBudgets.month, values.month)
			));
			const rows = budgets.filter((item) => Number(item.amount) > 0).map((item) => ({ ...item, userId: values.userId, month: values.month }));
			if (rows.length) await tx.insert(monthlyCategoryBudgets).values(rows);
		}
	});
}
