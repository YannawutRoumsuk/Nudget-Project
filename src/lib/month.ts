import type { ResolvedRange } from '$lib/ranges';
import {
	addMonths,
	bangkokMonthKey,
	bangkokParts,
	daysInBangkokMonth,
	formatThaiMonthYear,
	fromBangkok
} from '$lib/utils/date';

export const MIN_SELECTABLE_MONTH = '2000-01';

export interface MonthSelection extends ResolvedRange {
	key: string;
	previous: string | null;
	next: string | null;
	min: string;
	max: string;
	isCurrent: boolean;
	daysInMonth: number;
}

/** Resolve one bounded Bangkok calendar month. Invalid and future URLs fall back to the current month. */
export function resolveMonthSelection(value: string | null, now = new Date()): MonthSelection {
	const current = bangkokMonthKey(now);
	const key = isSelectableMonth(value, current) ? value : current;
	const { year, month } = monthParts(key);
	const from = fromBangkok(year, month, 1);
	const to = addMonths(from, 1);
	const previous = shiftMonthKey(key, -1);
	const next = key < current ? shiftMonthKey(key, 1) : null;
	const isCurrent = key === current;

	return {
		id: 'month',
		key,
		label: formatThaiMonthYear(from),
		from,
		to,
		elapsedDays: isCurrent ? bangkokParts(now).day : daysInBangkokMonth(from),
		previous: previous >= MIN_SELECTABLE_MONTH ? previous : null,
		next,
		min: MIN_SELECTABLE_MONTH,
		max: current,
		isCurrent,
		daysInMonth: daysInBangkokMonth(from)
	};
}

export function assertSelectableMonth(value: string, now = new Date()): void {
	const current = bangkokMonthKey(now);
	if (!isSelectableMonth(value, current)) throw new Error('เดือนไม่ถูกต้อง');
}

export function isMonthKey(value: string | null): value is string {
	if (!value) return false;
	const match = /^(\d{4})-(\d{2})$/.exec(value);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	return year >= 2000 && year <= 2200 && month >= 1 && month <= 12;
}

function isSelectableMonth(value: string | null, current: string): value is string {
	return isMonthKey(value) && value >= MIN_SELECTABLE_MONTH && value <= current;
}

function monthParts(key: string): { year: number; month: number } {
	const [year, month] = key.split('-').map(Number);
	return { year, month };
}

function shiftMonthKey(key: string, amount: number): string {
	const { year, month } = monthParts(key);
	return bangkokMonthKey(addMonths(fromBangkok(year, month, 1), amount));
}
