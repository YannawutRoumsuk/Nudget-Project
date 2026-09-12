import { describe, expect, it } from 'vitest';
import { parseInstallment } from '../src/lib/server/parser/installment';
import { parseMessage } from '../src/lib/server/parser';
import { bangkokDayKey } from '../src/lib/utils/date';

// 6 September 2026, Bangkok.
const now = new Date('2026-09-06T05:00:00Z');

describe('payment plans', () => {
	it('reads the reported message as three bills in the order typed', () => {
		const plan = parseInstallment('บิล shoppe 3 เดือน 4050 3800 3800', now);
		expect(plan?.bills.map((bill) => bill.amount)).toEqual([4050, 3800, 3800]);
		expect(plan?.bills.map((bill) => bill.sequence)).toEqual([1, 2, 3]);
		expect(plan?.name).toBe('บิล shoppe');
	});

	it('spreads the bills one month apart starting this month', () => {
		const plan = parseInstallment('บิล shoppe 3 เดือน 4050 3800 3800', now);
		expect(plan?.bills.map((bill) => bangkokDayKey(bill.dueDate))).toEqual([
			'2026-09-06',
			'2026-10-06',
			'2026-11-06'
		]);
	});

	it('repeats a single amount across every month', () => {
		const plan = parseInstallment('ผ่อนมือถือ 4 เดือน 1500', now);
		expect(plan?.bills.map((bill) => bill.amount)).toEqual([1500, 1500, 1500, 1500]);
	});

	it('lands on the last day of a short month instead of rolling over', () => {
		// 31 January: February has no 31st, so the second bill must not become March.
		const plan = parseInstallment('ผ่อน 2 เดือน 500', new Date('2026-01-31T05:00:00Z'));
		expect(plan?.bills.map((bill) => bangkokDayKey(bill.dueDate))).toEqual(['2026-01-31', '2026-02-28']);
	});

	it('does not treat the month count as one of the amounts', () => {
		const plan = parseInstallment('บิล shoppe 3 เดือน 4050 3800 3800', now);
		expect(plan?.bills.map((bill) => bill.amount)).not.toContain(3);
	});

	it('ignores a message with no plan cue', () => {
		// No บิล/ผ่อน/งวด, so this stays an ordinary expense.
		expect(parseInstallment('ค่าเน็ต 3 เดือน 1500', now)).toBeNull();
	});

	it('refuses a count that does not match the amounts', () => {
		expect(parseInstallment('บิล shoppe 3 เดือน 4050 3800', now)).toBeNull();
	});

	it('leaves an ordinary bill entry alone', () => {
		expect(parseInstallment('บิล shoppe 4050', now)).toBeNull();
	});

	it('routes a plan through parseMessage as its own outcome', async () => {
		const outcome = await parseMessage('บิล shoppe 3 เดือน 4050 3800 3800', now);
		expect(outcome.type).toBe('installment');
		expect(outcome.type === 'installment' && outcome.plan.bills).toHaveLength(3);
		expect(outcome.type === 'installment' && outcome.plan.categoryId).toBe('bills');
	});

	it('still records a single bill amount as a transaction', async () => {
		const outcome = await parseMessage('บิล shoppe 4050', now);
		expect(outcome.type).toBe('transaction');
	});
});
