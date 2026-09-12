import { describe, expect, it } from 'vitest';
import { assertSelectableMonth, isMonthKey, resolveMonthSelection } from '../src/lib/month';
import { bangkokDayKey } from '../src/lib/utils/date';

const NOW = new Date('2026-09-15T07:30:00.000Z');

describe('month selection', () => {
	it('resolves a historical month as one bounded Bangkok calendar month', () => {
		const month = resolveMonthSelection('2026-02', NOW);
		expect(month.key).toBe('2026-02');
		expect(month.label).toBe('กุมภาพันธ์ 2569');
		expect(bangkokDayKey(month.from)).toBe('2026-02-01');
		expect(bangkokDayKey(month.to)).toBe('2026-03-01');
		expect(month.elapsedDays).toBe(28);
		expect(month.previous).toBe('2026-01');
		expect(month.next).toBe('2026-03');
	});

	it('defaults invalid and future URLs to the current Bangkok month', () => {
		for (const input of [null, '2026-13', '2026-10', 'all', '1999-12']) {
			expect(resolveMonthSelection(input, NOW).key).toBe('2026-09');
		}
		expect(resolveMonthSelection('2026-09', NOW).next).toBeNull();
		expect(resolveMonthSelection('2026-09', NOW).elapsedDays).toBe(15);
	});

	it('validates stored plan month keys with the same rules', () => {
		expect(isMonthKey('2024-02')).toBe(true);
		expect(() => assertSelectableMonth('2026-09', NOW)).not.toThrow();
		expect(() => assertSelectableMonth('2026-10', NOW)).toThrow('เดือนไม่ถูกต้อง');
		expect(() => assertSelectableMonth('2026-00', NOW)).toThrow('เดือนไม่ถูกต้อง');
	});
});
