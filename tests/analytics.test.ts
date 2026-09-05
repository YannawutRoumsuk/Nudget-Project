import { describe, expect, it } from 'vitest';
import {
	buildBreakdown,
	donutArcs,
	fillDailySeries,
	niceCeiling,
	uncategorisedCount
} from '../src/lib/analytics';
import { fromBangkok } from '../src/lib/utils/date';

describe('fillDailySeries', () => {
	const from = fromBangkok(2026, 8, 30, 12);
	const to = fromBangkok(2026, 9, 1, 12);

	it('fills days that have no rows with zeros', () => {
		const filled = fillDailySeries(
			[{ day: '2026-08-31', income: 0, expense: 250 }],
			from,
			to,
			'2026-09-01'
		);
		expect(filled.map((d) => d.expense)).toEqual([0, 250, 0]);
	});

	it('marks today', () => {
		const filled = fillDailySeries([], from, to, '2026-09-01');
		expect(filled.filter((d) => d.isToday).map((d) => d.day)).toEqual(['2026-09-01']);
	});
});

describe('buildBreakdown', () => {
	const slices = [
		{ categoryId: 'food', total: 750, count: 9 },
		{ categoryId: 'transport', total: 250, count: 3 }
	];

	it('computes each share of the total', () => {
		const rows = buildBreakdown(slices);
		expect(rows.map((r) => r.share)).toEqual([75, 25]);
	});

	it('carries the category label and icon', () => {
		expect(buildBreakdown(slices)[0]).toMatchObject({ label: 'อาหาร', icon: '🍜' });
	});

	it('never divides by zero', () => {
		expect(buildBreakdown([{ categoryId: 'food', total: 0, count: 0 }])[0].share).toBe(0);
	});

	it('degrades gracefully for an unknown category id', () => {
		const [row] = buildBreakdown([{ categoryId: 'ghost', total: 10, count: 1 }]);
		expect(row.label).toBe('ghost');
		expect(row.icon).toBe('📦');
	});
});

describe('donutArcs', () => {
	it('emits one path per row', () => {
		const arcs = donutArcs(buildBreakdown([
			{ categoryId: 'food', total: 60, count: 1 },
			{ categoryId: 'transport', total: 40, count: 1 }
		]));
		expect(arcs).toHaveLength(2);
		expect(arcs.every((arc) => arc.path.startsWith('M '))).toBe(true);
	});

	it('returns nothing when there is no spend', () => {
		expect(donutArcs(buildBreakdown([{ categoryId: 'food', total: 0, count: 0 }]))).toEqual([]);
	});
});

describe('niceCeiling', () => {
	it.each([
		[0, 100],
		[7, 10],
		[42, 50],
		[120, 200],
		[1250, 2000],
		[6400, 10000]
	])('rounds %i up to %i', (input, expected) => {
		expect(niceCeiling(input)).toBe(expected);
	});
});

describe('uncategorisedCount', () => {
	it('counts only the fallback expense category', () => {
		expect(
			uncategorisedCount([
				{ categoryId: 'other', total: 100, count: 4 },
				{ categoryId: 'food', total: 900, count: 12 }
			])
		).toBe(4);
	});
});
