import { describe, expect, it } from 'vitest';
import { analyzeBudget } from '../src/lib/budget';

const base = {
	expectedIncome: 30_000,
	savingsGoal: 5_000,
	foodDailyBudget: 200,
	commuteDailyBudget: 100,
	commuteDays: 20,
	expense: 10_000,
	foodSpent: 2_000,
	commuteSpent: 800,
	unpaidBills: 3_000,
	currentDay: 10,
	daysInMonth: 30
};

describe('budget analysis', () => {
	it('reserves savings and upcoming bills before calculating safe daily spend', () => {
		const result = analyzeBudget(base);
		expect(result.spendable).toBe(25_000);
		expect(result.committed).toBe(13_000);
		expect(result.remaining).toBe(12_000);
		expect(result.daysRemaining).toBe(21);
		expect(result.safeDaily).toBeCloseTo(571.43, 2);
	});
	it('reports overspending when commitments exceed spendable income', () => {
		expect(analyzeBudget({ ...base, expense: 28_000 }).status).toBe('over');
	});
	it('asks for setup until income is entered', () => {
		expect(analyzeBudget({ ...base, expectedIncome: 0 }).status).toBe('setup');
	});
});
