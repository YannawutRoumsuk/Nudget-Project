import type { RangeOption } from '$lib/types';
import {
	addDays,
	addMonths,
	bangkokDayStart,
	bangkokMonthStart,
	bangkokParts,
	formatThaiMonthYear,
	formatThaiShortDate
} from '$lib/utils/date';

export const RANGE_OPTIONS: RangeOption[] = [
	{ id: 'today', label: 'วันนี้' },
	{ id: '7d', label: '7 วัน' },
	{ id: 'month', label: 'เดือนนี้' },
	{ id: '30d', label: '30 วัน' }
];

export const DEFAULT_RANGE = 'month';

export interface ResolvedRange {
	id: string;
	label: string;
	from: Date;
	/** Exclusive upper bound. */
	to: Date;
	/** Days the range covers *so far* — the divisor for a daily average. */
	elapsedDays: number;
}

/**
 * Ranges always end at "now", never at the end of a future period, so the daily
 * average of a half-finished month is not diluted by days that have not
 * happened yet.
 */
export function resolveRange(id: string | null, now = new Date()): ResolvedRange {
	const today = bangkokDayStart(now);
	const tomorrow = addDays(today, 1);

	switch (id) {
		case 'today':
			return {
				id: 'today',
				label: formatThaiShortDate(now),
				from: today,
				to: tomorrow,
				elapsedDays: 1
			};
		case '7d':
			return { id: '7d', label: '7 วันล่าสุด', from: addDays(today, -6), to: tomorrow, elapsedDays: 7 };
		case '30d':
			return {
				id: '30d',
				label: '30 วันล่าสุด',
				from: addDays(today, -29),
				to: tomorrow,
				elapsedDays: 30
			};
		case 'month':
		default: {
			const from = bangkokMonthStart(now);
			return {
				id: 'month',
				label: formatThaiMonthYear(now),
				from,
				// Cap at tomorrow so a mid-month view does not chart empty future days.
				to: tomorrow < addMonths(from, 1) ? tomorrow : addMonths(from, 1),
				elapsedDays: bangkokParts(now).day
			};
		}
	}
}
