import { describe, expect, it } from 'vitest';
import { detectMonthlyRecurring, normalizeMerchant } from '../src/lib/recurring';

function tx(day: string, amount: number, note = 'จ่าย Netflix 199 บาท', id = 1, excluded = false) {
	return { id, note, amount, categoryId: 'bills', occurredAt: new Date(`${day}T05:00:00.000Z`), paymentMethod: 'credit_card', creditCardId: 2, excluded };
}

describe('monthly recurring expense detection', () => {
	it('normalizes merchant text and detects stable repeats with monthly and yearly totals', () => {
		expect(normalizeMerchant('จ่าย Netflix 199 บาท')).toBe('netflix');
		const candidates = detectMonthlyRecurring([
			tx('2026-07-02', 199, 'จ่าย Netflix Basic 199', 1),
			tx('2026-08-02', 205, 'ค่า Netflix Standard ฿205', 2),
			tx('2026-09-02', 200, 'Netflix Premium 200', 3)
		]);
		expect(candidates).toHaveLength(1);
		expect(candidates[0]).toMatchObject({ merchantKey: 'netflix', amount: 200, monthlyTotal: 200, yearlyTotal: 2400, dueDay: 2, cycleDays: 31, occurrences: 3 });
	});

	it('requires at least three nearby monthly transactions with similar amounts', () => {
		expect(detectMonthlyRecurring([tx('2026-07-01', 200), tx('2026-08-01', 200)] )).toHaveLength(0);
		expect(detectMonthlyRecurring([tx('2026-07-01', 200), tx('2026-08-01', 200), tx('2026-09-01', 250)])).toHaveLength(0);
		expect(detectMonthlyRecurring([tx('2026-07-01', 200), tx('2026-08-01', 200), tx('2026-10-01', 200)])).toHaveLength(0);
	});

	it('ignores transactions the user marked as special', () => {
		expect(detectMonthlyRecurring([tx('2026-07-01', 200), tx('2026-08-01', 200), tx('2026-09-01', 200, undefined, 3, true)])).toHaveLength(0);
	});
});
