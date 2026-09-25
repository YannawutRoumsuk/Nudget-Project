import { describe, expect, it } from 'vitest';
import { buildCashflowCalendar } from '../src/lib/cashflow';

describe('monthly cashflow calendar', () => {
	it('separates actual flows, planned income, unpaid bills and card settlement', () => {
		const result = buildCashflowCalendar({
			year: 2026, month: 9, openingBalance: 50, plannedIncome: 2000, plannedIncomeDay: 25,
			actualDays: [{ day: '2026-09-01', income: 0, expense: 100 }, { day: '2026-09-05', income: 1000, expense: 0 }],
			unpaidBills: [{ id: 1, name: 'ค่าเน็ต', amount: 200, dueDate: new Date('2026-09-10T12:00:00Z') }],
			settlements: [{ billId: 2, name: 'บัตร', amount: 300, paidAt: new Date('2026-09-08T12:00:00Z') }],
			currentDay: 9, isCurrentMonth: true
		});
		expect(result.forecastIncome).toBe(1000);
		expect(result.days[0].endingBalance).toBe(-50);
		expect(result.days[7].actualExpense).toBe(300);
		expect(result.days[9].forecastExpense).toBe(200);
		expect(result.days[24].forecastIncome).toBe(1000);
		expect(result.lowestDay).toBe('2026-09-10');
	});

	it('moves overdue bills to the first day and flags them; old months have no planned income forecast', () => {
		const result = buildCashflowCalendar({
			year: 2026, month: 9, openingBalance: 0, plannedIncome: 30000, plannedIncomeDay: 25,
			actualDays: [], unpaidBills: [{ id: 1, name: 'ค้าง', amount: 100, dueDate: new Date('2026-08-30T12:00:00Z') }],
			settlements: [], currentDay: 30, isCurrentMonth: false
		});
		expect(result.forecastIncome).toBe(0);
		expect(result.days[0].events[0]).toMatchObject({ title: 'บิล เกินกำหนด · ค้าง', late: true });
		expect(result.lowestDay).toBe('2026-09-01');
	});

	it('clamps a configured payday to the last day of short months', () => {
		const result = buildCashflowCalendar({
			year: 2026, month: 2, openingBalance: 0, plannedIncome: 1000, plannedIncomeDay: 31,
			actualDays: [], unpaidBills: [], settlements: [], currentDay: 1, isCurrentMonth: true
		});
		expect(result.days).toHaveLength(28);
		expect(result.days[27].forecastIncome).toBe(1000);
	});
});
