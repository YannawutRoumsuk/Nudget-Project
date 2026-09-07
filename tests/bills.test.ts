import { describe, expect, it } from 'vitest';
import { billCopyDefaults, billDueDate, billPeriod, validateBillSchedule } from '../src/lib/bills';
import { bangkokDayKey } from '../src/lib/utils/date';

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
});
