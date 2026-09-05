import { FALLBACK_CATEGORY, getCategory } from '$lib/categories';
import type { CategorySlice, DayPoint } from '$lib/server/db/queries';
import { dayKeyRange } from '$lib/utils/date';

export interface FilledDay extends DayPoint {
	/** True for the day the user is currently in — the chart marks it. */
	isToday: boolean;
}

/**
 * Postgres only returns days that have rows. A spending chart with the empty
 * days missing lies about the shape of a month, so they get filled back in.
 */
export function fillDailySeries(
	points: DayPoint[],
	from: Date,
	to: Date,
	todayKey: string
): FilledDay[] {
	const byDay = new Map(points.map((p) => [p.day, p]));
	return dayKeyRange(from, to).map((day) => ({
		day,
		income: byDay.get(day)?.income ?? 0,
		expense: byDay.get(day)?.expense ?? 0,
		isToday: day === todayKey
	}));
}

export interface BreakdownRow {
	categoryId: string;
	label: string;
	icon: string;
	color: string;
	total: number;
	count: number;
	/** 0-100. */
	share: number;
}

export function buildBreakdown(slices: CategorySlice[]): BreakdownRow[] {
	const total = slices.reduce((sum, slice) => sum + slice.total, 0);
	return slices.map((slice) => {
		const category = getCategory(slice.categoryId);
		return {
			categoryId: slice.categoryId,
			label: category?.nameTh ?? slice.categoryId,
			icon: category?.icon ?? '📦',
			color: category?.color ?? 'oklch(65% 0.03 260)',
			total: slice.total,
			count: slice.count,
			share: total > 0 ? (slice.total / total) * 100 : 0
		};
	});
}

export interface DonutArc extends BreakdownRow {
	path: string;
}

/**
 * Builds donut segment paths on a unit-ish viewBox of 100x100.
 * Segments below `minSweep` degrees are still drawn so a tiny category does not
 * silently vanish from the legend's colour mapping.
 */
export function donutArcs(rows: BreakdownRow[], radius = 38, thickness = 16): DonutArc[] {
	const total = rows.reduce((sum, row) => sum + row.total, 0);
	if (total <= 0) return [];

	const gap = rows.length > 1 ? 1.5 : 0;
	let cursor = -90; // start at 12 o'clock

	return rows.map((row) => {
		const sweep = Math.max((row.total / total) * 360 - gap, 0.6);
		const path = arcPath(50, 50, radius, thickness, cursor, cursor + sweep);
		cursor += sweep + gap;
		return { ...row, path };
	});
}

function arcPath(
	cx: number,
	cy: number,
	radius: number,
	thickness: number,
	startDeg: number,
	endDeg: number
): string {
	const outer = radius;
	const inner = radius - thickness;
	const largeArc = endDeg - startDeg > 180 ? 1 : 0;

	const o1 = polar(cx, cy, outer, startDeg);
	const o2 = polar(cx, cy, outer, endDeg);
	const i2 = polar(cx, cy, inner, endDeg);
	const i1 = polar(cx, cy, inner, startDeg);

	return [
		`M ${o1.x} ${o1.y}`,
		`A ${outer} ${outer} 0 ${largeArc} 1 ${o2.x} ${o2.y}`,
		`L ${i2.x} ${i2.y}`,
		`A ${inner} ${inner} 0 ${largeArc} 0 ${i1.x} ${i1.y}`,
		'Z'
	].join(' ');
}

function polar(cx: number, cy: number, radius: number, degrees: number) {
	const rad = (degrees * Math.PI) / 180;
	return {
		x: round(cx + radius * Math.cos(rad)),
		y: round(cy + radius * Math.sin(rad))
	};
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}

/**
 * Rounds an axis ceiling up to a readable 1/2/5 x 10^n step so gridlines land
 * on numbers a person would actually say out loud.
 */
export function niceCeiling(max: number): number {
	if (max <= 0) return 100;
	const magnitude = 10 ** Math.floor(Math.log10(max));
	const normalized = max / magnitude;
	const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
	return step * magnitude;
}

/** Categories the parser could not identify — worth surfacing for a re-tag. */
export function uncategorisedCount(slices: CategorySlice[]): number {
	return slices
		.filter((slice) => slice.categoryId === FALLBACK_CATEGORY.expense)
		.reduce((sum, slice) => sum + slice.count, 0);
}
