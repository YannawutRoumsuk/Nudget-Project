import { describe, expect, it } from 'vitest';
import { forecastMonth } from '../src/lib/monthly-forecast';

const base = {
	year: 2026, month: 9, currentDay: 1, daysInMonth: 30, isCurrentMonth: true,
	actualIncome: 10000, expectedIncome: 30000, openingBalance: 500,
	fixedActual: 4000, variableActual: 100, specialActual: 500,
	knownFixedBills: 500, knownVariableBills: 100, cardPayables: 2000,
	historicalVariablePerDay: [100, 150, 200], monthlyBudget: 10000, savingsGoal: 5000
};

describe('deterministic month-end forecast', () => {
	it('uses history and current pace to estimate the range, bills, budget and cash', () => {
		const result = forecastMonth(base);
		expect(result.historyMonths).toBe(3);
		expect(result.lowSample).toBe(false);
		expect(result.variableRemaining?.median).toBe(4253.33);
		expect(result.totalExpense).toEqual({ low: 8825, median: 9453.33, high: 10275 });
		expect(result.cashRemaining).toEqual({ low: 18225, median: 19046.67, high: 19675 });
		expect(result.budgetOver).toBe(-546.67);
		expect(result.specialExpense).toBe(500);
	});

	it('warns on sparse history and widens the range when only one month exists', () => {
		const result = forecastMonth({ ...base, historicalVariablePerDay: [120] });
		expect(result.lowSample).toBe(true);
		expect(result.historyMonths).toBe(1);
		expect(result.variableRemaining!.low).toBeLessThan(result.variableRemaining!.median);
		expect(result.variableRemaining!.high).toBeGreaterThan(result.variableRemaining!.median);
	});

	it('does not claim zero future variable spending when history and current spend are both absent', () => {
		const result = forecastMonth({ ...base, variableActual: 0, historicalVariablePerDay: [] });
		expect(result.unknownVariableForecast).toBe(true);
		expect(result.totalExpense).toBeNull();
		expect(result.cashRemaining).toBeNull();
		expect(result.knownBills).toBe(600);
		expect(forecastMonth({ ...base, variableActual: 0, historicalVariablePerDay: [0, 0, 0] }).unknownVariableForecast).toBe(true);
	});

	it('uses current run rate with an explicit wide range when no history exists', () => {
		const result = forecastMonth({ ...base, currentDay: 15, variableActual: 3000, historicalVariablePerDay: [] });
		expect(result.lowSample).toBe(true);
		expect(result.unknownVariableForecast).toBe(false);
		expect(result.variableRemaining).toEqual({ low: 1500, median: 3000, high: 4500 });
	});

	it('reports the closed month without projecting further variable costs', () => {
		const result = forecastMonth({ ...base, currentDay: 30, isCurrentMonth: false });
		expect(result.daysRemaining).toBe(0);
		expect(result.variableRemaining).toEqual({ low: 0, median: 0, high: 0 });
		expect(result.totalExpense?.median).toBe(5200);
	});
});
