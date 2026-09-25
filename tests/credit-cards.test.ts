import { describe, expect, it } from 'vitest';
import { cardDueDate, currentCardCycle, splitInstallments } from '../src/lib/credit-cards';
import { deferredBillForTransaction } from '../src/lib/deferred';
import { bangkokDayKey, fromBangkok } from '../src/lib/utils/date';

describe('credit card cycles', () => {
	it('moves purchases after closing into the following statement, including year rollover', () => {
		const card = { closingDay: 25, dueDay: 15 };
		expect(bangkokDayKey(cardDueDate(fromBangkok(2026, 1, 25), card))).toBe('2026-02-15');
		expect(bangkokDayKey(cardDueDate(fromBangkok(2026, 1, 26), card))).toBe('2026-03-15');
		expect(bangkokDayKey(cardDueDate(fromBangkok(2026, 12, 26), card))).toBe('2027-02-15');
	});

	it('clamps cycle dates when a configured closing day does not exist in a month', () => {
		expect(bangkokDayKey(cardDueDate(fromBangkok(2026, 2, 28), { closingDay: 31, dueDay: 31 }))).toBe('2026-03-31');
	});

	it('includes the closing date in the current cycle and starts the next cycle the following day', () => {
		const cycle = currentCardCycle(fromBangkok(2026, 9, 25, 18), { closingDay: 25, dueDay: 15 });
		expect(bangkokDayKey(cycle.from)).toBe('2026-08-26');
		expect(bangkokDayKey(cycle.to)).toBe('2026-09-26');
	});

	it('splits installment totals to the exact cent without creating or losing money', () => {
		const installments = splitInstallments(1000, 3);
		expect(installments).toEqual([333.33, 333.33, 333.34]);
		expect(installments.reduce((total, amount) => total + amount, 0)).toBe(1000);
		expect(splitInstallments(1, 0)).toEqual([]);
	});

	it('uses the configured card cycle for the deferred obligation and keeps settlement out of expenses', () => {
		const bill = deferredBillForTransaction({
			id: 42, userId: 7, kind: 'expense', amount: '850.00', categoryId: 'food', note: 'ของใช้',
			occurredAt: fromBangkok(2026, 1, 26), paymentMethod: 'credit_card', creditCardId: 5
		}, { closingDay: 25, dueDay: 15 });
		expect(bill && bangkokDayKey(bill.dueDate)).toBe('2026-03-15');
		expect(bill).toMatchObject({ creditCardId: 5, noExpenseOnPay: true, sourceTransactionId: 42 });
	});
});
