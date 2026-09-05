import { describe, expect, it } from 'vitest';
import { DEFAULT_RANGE, RANGE_OPTIONS, resolveRange } from '../src/lib/ranges';
import { bangkokDayKey } from '../src/lib/utils/date';

/** 15 Sep 2026, 14:30 Bangkok. */
const NOW = new Date('2026-09-15T07:30:00.000Z');

describe('resolveRange', () => {
	it('covers exactly one day for today', () => {
		const range = resolveRange('today', NOW);
		expect(bangkokDayKey(range.from)).toBe('2026-09-15');
		expect(range.elapsedDays).toBe(1);
	});

	it('covers seven days inclusive of today', () => {
		const range = resolveRange('7d', NOW);
		expect(bangkokDayKey(range.from)).toBe('2026-09-09');
		expect(range.elapsedDays).toBe(7);
	});

	it('starts the month range on the 1st', () => {
		const range = resolveRange('month', NOW);
		expect(bangkokDayKey(range.from)).toBe('2026-09-01');
	});

	it('counts only elapsed days of a part-finished month', () => {
		expect(resolveRange('month', NOW).elapsedDays).toBe(15);
	});

	it('does not extend a mid-month range into the future', () => {
		const range = resolveRange('month', NOW);
		expect(bangkokDayKey(range.to)).toBe('2026-09-16');
	});

	it('falls back to the month range for an unknown id', () => {
		expect(resolveRange('nonsense', NOW).id).toBe('month');
		expect(resolveRange(null, NOW).id).toBe(DEFAULT_RANGE);
	});

	it('exposes every option the UI offers', () => {
		for (const option of RANGE_OPTIONS) {
			expect(resolveRange(option.id, NOW).id).toBe(option.id);
		}
	});
});
