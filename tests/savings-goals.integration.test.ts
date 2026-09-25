import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { users } from '../src/lib/server/db/schema';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const lineIds = ['Usaving-goal-one', 'Usaving-goal-two'];
if (url) process.env.DATABASE_URL = url;

suite('savings goals against PostgreSQL', async () => {
	const { addSavingsGoalContribution, createSavingsGoal, listGoalContributions, listSavingsGoals } = await import('../src/lib/server/db/savings-goals');
	const { closeDatabase, db } = await import('../src/lib/server/db');
	const { savingsGoalContributions, savingsGoals } = await import('../src/lib/server/db/schema');
	let userOne = 0;
	let userTwo = 0;

	beforeEach(async () => {
		await db.delete(users).where(inArray(users.lineUserId, lineIds));
		const inserted = await db.insert(users).values(lineIds.map((lineUserId) => ({ lineUserId }))).returning();
		userOne = inserted[0].id;
		userTwo = inserted[1].id;
	});
	afterAll(async () => {
		await db.delete(users).where(inArray(users.lineUserId, lineIds));
		await closeDatabase();
	});

	it('records contributions atomically without transactions and keeps goals private to each user', async () => {
		const [{ id: goalId }] = await createSavingsGoal({ userId: userOne, name: 'ฉุกเฉิน', targetAmount: '1000.00', currentAmount: '0.00', targetDate: null, monthlyContribution: '100.00', priority: 1 });
		expect(await addSavingsGoalContribution(userOne, goalId, '125.50')).toBe(true);
		expect(await addSavingsGoalContribution(userTwo, goalId, '100.00')).toBe(false);
		expect((await listSavingsGoals(userOne)).map((goal) => goal.currentAmount)).toEqual(['125.50']);
		expect(await listSavingsGoals(userTwo)).toEqual([]);
		expect((await listGoalContributions(userOne)).map((row) => row.amount)).toEqual(['125.50']);
		expect(await listGoalContributions(userTwo)).toEqual([]);
		expect(await addSavingsGoalContribution(userOne, goalId, '900.00')).toBe(false);
		expect((await db.select().from(savingsGoalContributions).where(eq(savingsGoalContributions.userId, userOne))).length).toBe(1);
		await db.delete(users).where(eq(users.id, userOne));
		expect(await db.select().from(savingsGoals).where(eq(savingsGoals.id, goalId))).toEqual([]);
	});
});
