import { describe, expect, it } from 'vitest';
import { calculateFinancialHealth } from '../src/lib/financial-health';

const empty = {
	income: null, expense: null, budgets: null, monthlyBills: null,
	emergencyBalance: null, averageMonthlyExpense: null, recordedDays: null, elapsedDays: 30
};

describe('calculateFinancialHealth', () => {
	it('does not treat missing data as zero', () => {
		const result = calculateFinancialHealth(empty);
		expect(result.score).toBeNull();
		expect(result.knownFactors).toBe(0);
		expect(result.factors.every((factor) => factor.score === null)).toBe(true);
	});

	it('renormalizes weights over known factors and is deterministic', () => {
		const input = { ...empty, income: 30000, expense: 24000 };
		const first = calculateFinancialHealth(input);
		expect(first).toEqual(calculateFinancialHealth(input));
		expect(first.score).toBe(100);
		expect(first.knownFactors).toBe(1);
		expect(first.factors.find((factor) => factor.id === 'savings')?.score).toBe(100);
	});

	it('caps suggestions at three and clamps factor values', () => {
		const result = calculateFinancialHealth({
			...empty, income: 10000, expense: 15000,
			budgets: [{ budget: 100, spent: 1000 }], monthlyBills: 9000,
			emergencyBalance: 0, averageMonthlyExpense: 10000, recordedDays: 0
		});
		expect(result.score).toBeGreaterThanOrEqual(0);
		expect(result.score).toBeLessThanOrEqual(100);
		expect(result.recommendations.length).toBe(3);
		expect(result.factors.filter((factor) => factor.score !== null).every((factor) => factor.score! >= 0 && factor.score! <= 100)).toBe(true);
	});
});
