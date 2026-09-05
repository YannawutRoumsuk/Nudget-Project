import { bangkokParts, fromBangkok } from '$lib/utils/date';

/** Matches PostgreSQL numeric(12, 2), including its maximum positive value. */
export function validAmount(amount: number): boolean {
	return Number.isFinite(amount) && amount >= 0.01 && amount <= 9_999_999_999.99;
}

export function validCalendarDate(year: number, month: number, day: number): boolean {
	const result = bangkokParts(fromBangkok(year, month, day));
	return result.year === year && result.month === month && result.day === day;
}
