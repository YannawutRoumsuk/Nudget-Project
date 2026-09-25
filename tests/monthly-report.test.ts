import { describe, expect, it } from 'vitest';
import { buildReportCategories, summarizeReportBudgets } from '../src/lib/monthly-report';

describe('monthly report data', () => {
	it('hides category rows in privacy mode while retaining only aggregate budget totals', () => {
		const slices = [{ categoryId: 'food', total: 800 }, { categoryId: 'transport', total: 300 }];
		const budgets = [{ categoryId: 'food', amount: '500.00' }];
		expect(buildReportCategories(slices, budgets, true)).toEqual([]);
		expect(summarizeReportBudgets(slices, budgets)).toEqual({ total: 500, over: 300 });
	});

	it('lists detailed categories by spending and does not count unbudgeted categories as over budget', () => {
		const slices = [{ categoryId: 'food', total: 800 }, { categoryId: 'transport', total: 300 }];
		const rows = buildReportCategories(slices, [{ categoryId: 'food', amount: '900.00' }], false);
		expect(rows[0]).toMatchObject({ id: 'food', amount: 800, budget: 900 });
		expect(rows[1]).toMatchObject({ id: 'transport', amount: 300, budget: null });
		expect(summarizeReportBudgets(slices, [{ categoryId: 'food', amount: '900.00' }])).toEqual({ total: 900, over: 0 });
	});

	it('marks a month without category budgets as unknown instead of zero', () => {
		expect(summarizeReportBudgets([{ categoryId: 'food', total: 800 }], [])).toEqual({ total: null, over: null });
	});
});
