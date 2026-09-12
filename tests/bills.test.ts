import { describe, expect, it } from 'vitest';
import { billDueDate, billPeriod, validateBillSchedule } from '../src/lib/bills';
import { bangkokDayKey, bangkokParts, fromBangkok } from '../src/lib/utils/date';

const reference = new Date('2026-09-05T03:00:00Z');

describe('bill schedule', () => {
	it('clamps monthly day 31 to the last day of a short month', () => {
		const due = billDueDate({ recurrence: 'monthly', dueDay: 31, dueDate: null }, new Date('2026-02-01T00:00:00Z'));
		expect(due && bangkokDayKey(due)).toBe('2026-02-28');
	});
	it('uses a stable monthly period', () => {
		expect(billPeriod({ recurrence: 'monthly', dueDate: null }, reference)).toBe('2026-09');
	});
	it('validates schedules by recurrence', () => {
		expect(validateBillSchedule('monthly', 15, null)).toBe(true);
		expect(validateBillSchedule('monthly', 0, null)).toBe(false);
		expect(validateBillSchedule('once', null, new Date('2026-09-20'))).toBe(true);
	});
	it('rejects each recurrence when its own field is the missing one', () => {
		expect(validateBillSchedule('monthly', null, new Date('2026-09-20'))).toBe(false);
		expect(validateBillSchedule('once', 15, null)).toBe(false);
		expect(validateBillSchedule('monthly', 32, null)).toBe(false);
	});
});

describe('due dates typed straight into a POST', () => {
	// `Date.UTC` rolls 31 February into March rather than refusing it, so a due
	// date has to survive being read back before it can be trusted.
	const roundTrips = (raw: string) => {
		const [year, month, day] = raw.split('-').map(Number);
		const parts = bangkokParts(fromBangkok(year, month, day, 9));
		return parts.year === year && parts.month === month && parts.day === day;
	};

	it('accepts a real day', () => {
		expect(roundTrips('2026-09-20')).toBe(true);
		expect(roundTrips('2028-02-29')).toBe(true);
	});
	it('refuses a day that does not exist', () => {
		expect(roundTrips('2026-02-31')).toBe(false);
		expect(roundTrips('2026-13-01')).toBe(false);
	});
});
