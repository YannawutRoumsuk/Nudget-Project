import { describe, expect, it } from 'vitest';
import { billCopyDefaults, billDueDate, billPeriod, groupBillsByDueMonth, validateBillSchedule } from '../src/lib/bills';
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
	it('copies only editable bill fields into a fresh form', () => {
		const source = {
			id: 42, userId: 9, name: 'ค่าไฟ', amount: '950.25', categoryId: 'bills', paymentMethod: 'bank' as const,
			recurrence: 'monthly' as const, dueDay: 15, dueDate: null, active: false,
			createdAt: new Date(), updatedAt: new Date()
		};
		expect(billCopyDefaults(source)).toEqual({
			name: 'ค่าไฟ', amount: '950.25', categoryId: 'bills', paymentMethod: 'bank',
			recurrence: 'monthly', dueDay: 15, dueDate: null
		});
		expect(billCopyDefaults(source)).not.toHaveProperty('id');
		expect(billCopyDefaults(source)).not.toHaveProperty('active');
	});

	it('groups bills by due month and separates paid from unpaid items', () => {
		const reference = new Date('2026-09-01T00:00:00Z');
		const bills = [
			{ id: 1, recurrence: 'monthly' as const, dueDay: 15, dueDate: null, paid: false },
			{ id: 2, recurrence: 'monthly' as const, dueDay: 5, dueDate: null, paid: true },
			{ id: 3, recurrence: 'once' as const, dueDay: null, dueDate: new Date('2026-10-01T00:00:00Z'), paid: false }
		];

		expect(groupBillsByDueMonth(bills, reference)).toMatchObject([
			{ key: '2026-09', label: 'กันยายน 2569', unpaid: [{ id: 1 }], paid: [{ id: 2 }] },
			{ key: '2026-10', label: 'ตุลาคม 2569', unpaid: [{ id: 3 }], paid: [] }
		]);
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
