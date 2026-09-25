import { describe, expect, it } from 'vitest';
import { calculateWhatIf } from '../src/lib/what-if';
import type { WhatIfInputs } from '../src/lib/what-if';

const fixture: WhatIfInputs = {
	budget: {
		expectedIncome: 30000, savingsGoal: 5000, foodDailyBudget: 100, commuteDailyBudget: 50, commuteDays: 20,
		expense: 4000, cashExpense: 2500, unpaidBills: 1000, unpaidCardBills: 300,
		foodSpent: 1000, commuteSpent: 500, currentDay: 10, daysInMonth: 30
	},
	categoryBudgets: [
		{ categoryId: 'food', budget: 3000, spent: 1000 },
		{ categoryId: 'transport', budget: 1500, spent: 500 }
	],
	bills: [{ id: 9, amount: 300, categoryId: 'bills', noExpenseOnPay: true, dueDate: new Date('2026-09-25T02:00:00Z') }]
};

describe('what-if scenarios', () => {
	it('reuses the monthly budget formulas and applies several temporary changes together', () => {
		const result = calculateWhatIf(fixture, [
			{ id: 'a', type: 'transaction', kind: 'expense', amount: 500, categoryId: 'food', note: 'ซื้อเพิ่ม' },
			{ id: 'b', type: 'savings', amount: 6000 },
			{ id: 'c', type: 'categoryBudget', categoryId: 'food', amount: 400 },
			{ id: 'd', type: 'postponeBill', billId: 9, days: 8 }
		], 10, 30);

		expect(result.before.analysis.remaining).toBe(21200);
		expect(result.after.analysis.remaining).toBe(20000);
		expect(result.after.categories.find((row) => row.categoryId === 'food')).toMatchObject({ budget: 2600, spent: 1500, remaining: 1100 });
		expect(result.before.savingsRate).toBeCloseTo(16.67, 1);
		expect(result.after.savingsRate).toBe(20);
		expect(result.postponedBills[0].to).toEqual(new Date('2026-10-03T02:00:00Z'));
	});

	it('does not change a real input or count postponing within the month as new money', () => {
		const result = calculateWhatIf(fixture, [
			{ id: 'd', type: 'postponeBill', billId: 9, days: 2 },
			{ id: 'i', type: 'transaction', kind: 'income', amount: 1000, categoryId: 'income', note: 'โบนัส' }
		], 10, 30);
		expect(result.after.analysis.remaining).toBe(22200);
		expect(fixture.budget.expectedIncome).toBe(30000);
		expect(fixture.bills[0].dueDate).toEqual(new Date('2026-09-25T02:00:00Z'));
	});
});
