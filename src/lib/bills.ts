import type { Bill, BillRecurrence } from '$lib/server/db/schema';
import { bangkokMonthKey, bangkokParts, fromBangkok } from '$lib/utils/date';

export function billDueDate(bill: Pick<Bill, 'recurrence' | 'dueDay' | 'dueDate'>, reference: Date): Date | null {
	if (bill.recurrence === 'once') return bill.dueDate;
	if (!bill.dueDay) return null;
	const { year, month } = bangkokParts(reference);
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return fromBangkok(year, month, Math.min(lastDay, bill.dueDay), 9, 0);
}

export function billPeriod(
	bill: Pick<Bill, 'recurrence' | 'dueDate'>,
	reference: Date
): string {
	if (bill.recurrence === 'once' && bill.dueDate) {
		const { year, month, day } = bangkokParts(bill.dueDate);
		return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	}
	return bangkokMonthKey(reference);
}

export function validateBillSchedule(recurrence: BillRecurrence, dueDay: number | null, dueDate: Date | null): boolean {
	return recurrence === 'monthly'
		? Number.isInteger(dueDay) && (dueDay ?? 0) >= 1 && (dueDay ?? 0) <= 31
		: dueDate instanceof Date && Number.isFinite(dueDate.getTime());
}
