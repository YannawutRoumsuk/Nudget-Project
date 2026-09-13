import { describe, expect, it } from 'vitest';
import { deferredBillForTransaction } from '../src/lib/deferred';
import { bangkokDayKey, fromBangkok } from '../src/lib/utils/date';

const purchase = {
	id: 42, userId: 7, kind: 'expense' as const, amount: '850.00', categoryId: 'shopping', note: 'รองเท้า',
	occurredAt: fromBangkok(2026, 1, 31, 18), paymentMethod: 'credit_card' as const
};

describe('deferredBillForTransaction', () => {
	it('creates one next-month obligation and clamps short months', () => {
		const bill = deferredBillForTransaction(purchase)!;
		expect(bill).toMatchObject({ userId: 7, amount: '850.00', categoryId: 'bills', recurrence: 'once', sourceTransactionId: 42 });
		expect(bill.name).toContain('บัตรเครดิต');
		expect(bangkokDayKey(bill.dueDate)).toBe('2026-02-28');
	});

	it('does not create a bill for cash or income', () => {
		expect(deferredBillForTransaction({ ...purchase, paymentMethod: 'cash' })).toBeNull();
		expect(deferredBillForTransaction({ ...purchase, kind: 'income' })).toBeNull();
	});
});
