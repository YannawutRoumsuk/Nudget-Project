import { describe, expect, it } from 'vitest';
import { monthlyGoalReserve } from '../src/lib/savings-goals';

describe('savings goal monthly reserve', () => {
	const now = new Date('2026-09-25T12:00:00+07:00');

	it('divides remaining amount evenly through the target month, including this month', () => {
		expect(monthlyGoalReserve({ name: 'trip', targetAmount: 10000, currentAmount: 4000, targetDate: new Date('2026-12-01T12:00:00Z'), monthlyContribution: 0 }, now)).toBe(1500);
	});

	it('reserves a final partial month and handles overdue goals in one month', () => {
		expect(monthlyGoalReserve({ name: 'trip', targetAmount: 100, currentAmount: 0, targetDate: new Date('2026-09-02T12:00:00Z'), monthlyContribution: 0 }, now)).toBe(100);
		expect(monthlyGoalReserve({ name: 'trip', targetAmount: 100, currentAmount: 0, targetDate: new Date('2026-08-02T12:00:00Z'), monthlyContribution: 0 }, now)).toBe(100);
	});

	it('uses the chosen monthly amount when there is no target date and stops at a funded goal', () => {
		expect(monthlyGoalReserve({ name: 'emergency', targetAmount: 10000, currentAmount: 250, targetDate: null, monthlyContribution: 750 }, now)).toBe(750);
		expect(monthlyGoalReserve({ name: 'emergency', targetAmount: 10000, currentAmount: 9750, targetDate: null, monthlyContribution: 750 }, now)).toBe(250);
		expect(monthlyGoalReserve({ name: 'emergency', targetAmount: 10000, currentAmount: 10000, targetDate: null, monthlyContribution: 750 }, now)).toBe(0);
	});

	it('uses Bangkok month at the UTC month boundary', () => {
		expect(monthlyGoalReserve({ name: 'trip', targetAmount: 1000, currentAmount: 0, targetDate: new Date('2026-10-01T12:00:00Z'), monthlyContribution: 0 }, new Date('2026-09-30T18:00:00Z'))).toBe(1000);
	});
});
