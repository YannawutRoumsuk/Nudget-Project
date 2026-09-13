import { describe, expect, it } from 'vitest';
import { formatMonthlyLineSummary } from '../src/lib/server/monthly-summary';
import type { InsightInput } from '../src/lib/server/insights';

const input: InsightInput = {
	month: '2026-09', monthLabel: 'กันยายน 2569', income: 30000, expense: 14200, net: 15800,
	savings: 15800, savingsRate: 52.67, creditCardSpent: 2000, payLaterSpent: 500,
	regularExpense: 6000, fixedExpense: 8200, foodExpense: 3500, transportExpense: 1500,
	otherExpense: 1000, regularDailyAverage: 200, foodDailyAverage: 116.67,
	transportDailyAverage: 50, otherDailyAverage: 33.33, previousIncome: 30000,
	previousExpense: 13000, categories: [], unpaidBills: 0, nextMonthBills: 2500,
	plan: null, remainingBudget: null, daysElapsed: 30, daysInMonth: 30, transactionCount: 20,
	busiestDay: { day: '2026-09-10', expense: 900 }
};

describe('formatMonthlyLineSummary', () => {
	it('separates everyday averages, fixed costs, and next-month obligations', () => {
		const text = formatMonthlyLineSummary(input, null);
		expect(text).toContain('เงินใช้ชีวิต 6,000 บาท · เฉลี่ย 200 บาท/วัน');
		expect(text).toContain('ค่าเช่าและบิลที่จ่ายแล้ว 8,200 บาท');
		expect(text).toContain('ภาระเดือนหน้า 2,500 บาท');
		expect(text).toContain('บัตร/PayLater เดือนนี้ 2,500 บาท');
	});
});
