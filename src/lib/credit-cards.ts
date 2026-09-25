import { addMonths, bangkokParts, daysInBangkokMonth, fromBangkok } from '$lib/utils/date';

export interface CreditCardSchedule {
	closingDay: number;
	dueDay: number;
}

function dateInMonth(monthAnchor: Date, day: number): Date {
	const { year, month } = bangkokParts(monthAnchor);
	return fromBangkok(year, month, Math.min(day, daysInBangkokMonth(monthAnchor)), 9);
}

/** Returns the card's payment due date for a purchase, including month/year rollover. */
export function cardDueDate(purchaseDate: Date, card: CreditCardSchedule): Date {
	const p = bangkokParts(purchaseDate);
	const purchaseMonth = fromBangkok(p.year, p.month, 1);
	const statementMonth = p.day <= card.closingDay ? purchaseMonth : addMonths(purchaseMonth, 1);
	return dateInMonth(addMonths(statementMonth, 1), card.dueDay);
}

/** Current unclosed statement window, as Bangkok-local instants in [from, to). */
export function currentCardCycle(now: Date, card: CreditCardSchedule): { from: Date; to: Date } {
	const p = bangkokParts(now);
	const currentMonth = fromBangkok(p.year, p.month, 1);
	const closingThisMonth = dateInMonth(currentMonth, card.closingDay);
	const close = p.day <= card.closingDay ? closingThisMonth : dateInMonth(addMonths(currentMonth, 1), card.closingDay);
	const previousClose = dateInMonth(addMonths(close, -1), card.closingDay);
	const before = bangkokParts(previousClose);
	const after = bangkokParts(close);
	return {
		from: fromBangkok(before.year, before.month, before.day + 1),
		to: fromBangkok(after.year, after.month, after.day + 1)
	};
}

/** Divide baht into equal-cent installments, assigning any remainder to the final bill. */
export function splitInstallments(total: number, count: number): number[] {
	const cents = Math.round(total * 100);
	if (!Number.isInteger(count) || count < 2 || count > 60 || cents < count) return [];
	const each = Math.floor(cents / count);
	return Array.from({ length: count }, (_, i) => (i === count - 1 ? cents - each * (count - 1) : each) / 100);
}
