import { eq } from 'drizzle-orm';
import { db } from './index';
import { monthlyPlans } from './schema';
import type { MonthlyPlan } from './schema';

export async function getMonthlyPlan(month: string): Promise<MonthlyPlan | null> {
	const [row] = await db.select().from(monthlyPlans).where(eq(monthlyPlans.month, month)).limit(1);
	return row ?? null;
}

export async function saveMonthlyPlan(values: Omit<typeof monthlyPlans.$inferInsert, 'updatedAt'>): Promise<MonthlyPlan> {
	const [row] = await db
		.insert(monthlyPlans)
		.values(values)
		.onConflictDoUpdate({
			target: monthlyPlans.month,
			set: { ...values, updatedAt: new Date() }
		})
		.returning();
	return row;
}
