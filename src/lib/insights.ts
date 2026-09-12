import { getCategory } from '$lib/categories';

/**
 * Presentation helpers for the month-over-month comparison. Pure on purpose:
 * everything here is arithmetic a test can reach, which is where the sharp
 * edges live — a category that did not exist last month has no percentage, and
 * printing Infinity at someone about their own money is not an option.
 */

export interface ComparisonSource {
	categoryId: string;
	current: number;
	previous: number;
	delta: number;
}

export type ChangeKind = 'new' | 'gone' | 'up' | 'down' | 'same';

export interface ComparisonRow {
	categoryId: string;
	label: string;
	icon: string;
	current: number;
	previous: number;
	delta: number;
	/** null when there is no meaningful baseline to divide by. */
	percent: number | null;
	kind: ChangeKind;
	changeLabel: string;
	/** 0 to 1, relative to the largest current amount in the set. */
	share: number;
}

/** Anything smaller than a baht is rounding, not a change worth a label. */
const NOISE = 1;

export function percentChange(current: number, previous: number): number | null {
	if (previous <= 0) return null;
	return ((current - previous) / previous) * 100;
}

export function classifyChange(current: number, previous: number): ChangeKind {
	if (previous <= 0 && current > 0) return 'new';
	if (current <= 0 && previous > 0) return 'gone';
	if (Math.abs(current - previous) < NOISE) return 'same';
	return current > previous ? 'up' : 'down';
}

/**
 * The label carries the direction in words, so the colour is never the only
 * thing separating growth from shrinkage.
 */
export function changeLabel(kind: ChangeKind, percent: number | null): string {
	switch (kind) {
		case 'new':
			return 'เพิ่งมีเดือนนี้';
		case 'gone':
			return 'เดือนนี้ไม่มี';
		case 'same':
			return 'เท่าเดิม';
		default: {
			const direction = kind === 'up' ? 'เพิ่มขึ้น' : 'ลดลง';
			if (percent === null) return direction;
			const rounded = Math.round(Math.abs(percent));
			// Beyond a few multiples the exact figure stops meaning anything, and
			// "เพิ่มขึ้น 4200%" reads as a bug rather than a fact.
			return rounded > 999 ? `${direction}มาก` : `${direction} ${rounded}%`;
		}
	}
}

/**
 * Sorted by how much the number moved, because the reader opened this page to
 * find out what changed, not what is merely large.
 */
export function buildComparison(sources: ComparisonSource[]): ComparisonRow[] {
	const peak = sources.reduce((max, row) => Math.max(max, row.current), 0);
	return sources
		.map((row) => {
			const kind = classifyChange(row.current, row.previous);
			const percent = percentChange(row.current, row.previous);
			const category = getCategory(row.categoryId);
			return {
				categoryId: row.categoryId,
				label: category?.nameTh ?? row.categoryId,
				icon: category?.icon ?? '📦',
				current: row.current,
				previous: row.previous,
				delta: row.delta,
				percent,
				kind,
				changeLabel: changeLabel(kind, percent),
				share: peak > 0 ? row.current / peak : 0
			};
		})
		.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** What the savings ideas add up to, for the line under the list. */
export function totalSavings(savings: { monthlySaving: number }[]): number {
	return savings.reduce((sum, idea) => sum + idea.monthlySaving, 0);
}
