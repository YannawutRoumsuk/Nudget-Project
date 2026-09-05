import { describe, expect, it } from 'vitest';
import {
	addDays,
	addMonths,
	bangkokDayKey,
	bangkokDayStart,
	bangkokMonthStart,
	bangkokParts,
	dayKeyRange,
	formatThaiMonthYear,
	formatThaiShortDate,
	formatThaiTime,
	fromBangkok
} from '../src/lib/utils/date';

describe('bangkok time', () => {
	it('shifts UTC into +07:00', () => {
		expect(bangkokParts(new Date('2026-09-01T07:30:00Z'))).toEqual({
			year: 2026,
			month: 9,
			day: 1,
			hour: 14,
			minute: 30
		});
	});

	it('puts late-evening UTC on the next Bangkok day', () => {
		// 31 Aug 18:00Z is already 1 Sep in Bangkok — the bug this app must not have.
		expect(bangkokDayKey(new Date('2026-08-31T18:00:00Z'))).toBe('2026-09-01');
	});

	it('round-trips through fromBangkok', () => {
		const instant = fromBangkok(2026, 9, 1, 14, 30);
		expect(instant.toISOString()).toBe('2026-09-01T07:30:00.000Z');
	});

	it('starts the day at Bangkok midnight', () => {
		const start = bangkokDayStart(new Date('2026-09-01T07:30:00Z'));
		expect(start.toISOString()).toBe('2026-08-31T17:00:00.000Z');
	});

	it('starts the month at Bangkok midnight on the 1st', () => {
		const start = bangkokMonthStart(new Date('2026-09-15T07:30:00Z'));
		expect(bangkokDayKey(start)).toBe('2026-09-01');
	});
});

describe('arithmetic', () => {
	it('adds days across a month boundary', () => {
		expect(bangkokDayKey(addDays(fromBangkok(2026, 8, 31, 12), 1))).toBe('2026-09-01');
	});

	it('clamps when a month is shorter', () => {
		expect(bangkokDayKey(addMonths(fromBangkok(2026, 1, 31, 12), 1))).toBe('2026-02-28');
	});

	it('rolls the year over', () => {
		expect(bangkokDayKey(addMonths(fromBangkok(2026, 12, 15, 12), 1))).toBe('2027-01-15');
	});
});

describe('dayKeyRange', () => {
	it('is inclusive of both ends of the covered days', () => {
		const keys = dayKeyRange(fromBangkok(2026, 8, 30, 12), fromBangkok(2026, 9, 1, 12));
		expect(keys).toEqual(['2026-08-30', '2026-08-31', '2026-09-01']);
	});

	it('returns a single day when from and to share a day', () => {
		const day = fromBangkok(2026, 9, 1, 12);
		expect(dayKeyRange(day, day)).toEqual(['2026-09-01']);
	});
});

describe('formatting', () => {
	const instant = fromBangkok(2026, 9, 1, 9, 5);

	it('formats a short Thai date', () => {
		expect(formatThaiShortDate(instant)).toBe('1 ก.ย.');
	});

	it('formats month and year in the Buddhist era', () => {
		expect(formatThaiMonthYear(instant)).toBe('กันยายน 2569');
	});

	it('zero-pads the time', () => {
		expect(formatThaiTime(instant)).toBe('09:05');
	});
});
