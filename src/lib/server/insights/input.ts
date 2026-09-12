import { createHash } from 'node:crypto';
import { resolveMonthSelection } from '$lib/month';
import { getUnpaidBillTotal } from '$lib/server/db/bills';
import { getMonthlyPlan } from '$lib/server/db/plans';
import { getByCategory, getDailySeries, getTotals } from '$lib/server/db/queries';
import type { Range } from '$lib/server/db/queries';
import { addMonths } from '$lib/utils/date';
import { toNumber } from '$lib/utils/money';

export interface CategoryChange {
	categoryId: string;
	current: number;
	previous: number;
	/** current - previous, in baht. Positive means spending grew. */
	delta: number;
}

export interface InsightInput {
	month: string; // 'YYYY-MM'
	monthLabel: string; // Thai, e.g. 'กันยายน 2569'
	income: number;
	expense: number;
	net: number;
	previousIncome: number;
	previousExpense: number;
	/** Expense categories, this month vs last, biggest current first. */
	categories: CategoryChange[];
	unpaidBills: number;
	plan: {
		expectedIncome: number;
		savingsGoal: number;
		foodDailyBudget: number;
		commuteDailyBudget: number;
		commuteDays: number;
	} | null;
	daysElapsed: number;
	daysInMonth: number;
	transactionCount: number;
	/** Highest single day of spending in the month, for the page to point at. */
	busiestDay: { day: string; expense: number } | null;
}

/**
 * Everything the analysis is allowed to know about a month, and nothing else.
 * The shape is deliberately all aggregates: it is what gets fingerprinted, and
 * it is the only thing that ever reaches a model — see `generate.ts`.
 */
export async function buildInsightInput(
	userId: number,
	month: string,
	now = new Date()
): Promise<InsightInput> {
	// Resolving rather than trusting the string keeps a hand-typed or future
	// month from producing an analysis of a window that does not exist.
	const selection = resolveMonthSelection(month, now);
	const range: Range = { from: selection.from, to: selection.to };
	const previousRange: Range = { from: addMonths(selection.from, -1), to: selection.from };

	// Both months go out at once: the comparison is the whole point of the
	// analysis, so waiting for this month before asking for the last one would
	// double the latency for no gain.
	const [totals, slices, series, unpaidBills, plan, previousTotals, previousSlices] = await Promise.all([
		getTotals(userId, range),
		getByCategory(userId, range, 'expense'),
		getDailySeries(userId, range),
		getUnpaidBillTotal(userId, selection.from),
		getMonthlyPlan(userId, selection.key),
		getTotals(userId, previousRange),
		getByCategory(userId, previousRange, 'expense')
	]);

	return {
		month: selection.key,
		monthLabel: selection.label,
		income: baht(totals.income),
		expense: baht(totals.expense),
		net: baht(totals.net),
		previousIncome: baht(previousTotals.income),
		previousExpense: baht(previousTotals.expense),
		categories: toCategoryChanges(slices, previousSlices),
		unpaidBills: baht(unpaidBills),
		plan: plan
			? {
					expectedIncome: toNumber(plan.expectedIncome),
					savingsGoal: toNumber(plan.savingsGoal),
					foodDailyBudget: toNumber(plan.foodDailyBudget),
					commuteDailyBudget: toNumber(plan.commuteDailyBudget),
					commuteDays: plan.commuteDays
				}
			: null,
		// A finished month is fully elapsed; averaging it over "today" would make
		// every past month look like it was only half spent.
		daysElapsed: selection.elapsedDays,
		daysInMonth: selection.daysInMonth,
		transactionCount: totals.count,
		busiestDay: toBusiestDay(series)
	};
}

/**
 * Stable hash of every number above, so a reload reuses the stored analysis.
 * Categories are sorted by id rather than by amount: two categories tied on
 * total can come back from Postgres in either order, and a fingerprint that
 * flips with the row order would buy a fresh LLM call for nothing.
 */
export function fingerprintInput(input: InsightInput): string {
	const categories = [...input.categories]
		.sort((a, b) => a.categoryId.localeCompare(b.categoryId))
		.map((change) => `${change.categoryId}=${change.current}/${change.previous}`);

	const parts = [
		input.month,
		input.income,
		input.expense,
		input.net,
		input.previousIncome,
		input.previousExpense,
		input.unpaidBills,
		input.daysElapsed,
		input.daysInMonth,
		input.transactionCount,
		input.busiestDay ? `${input.busiestDay.day}=${input.busiestDay.expense}` : '-',
		input.plan
			? [
					input.plan.expectedIncome,
					input.plan.savingsGoal,
					input.plan.foodDailyBudget,
					input.plan.commuteDailyBudget,
					input.plan.commuteDays
				].join(',')
			: '-',
		...categories
	];

	return createHash('sha256').update(parts.join('|')).digest('hex');
}

/**
 * A category that vanished since last month is as worth saying as one that
 * grew, so the previous month contributes rows of its own rather than only
 * filling in a `previous` column.
 */
function toCategoryChanges(
	current: Array<{ categoryId: string; total: number }>,
	previous: Array<{ categoryId: string; total: number }>
): CategoryChange[] {
	const previousTotals = new Map(previous.map((slice) => [slice.categoryId, slice.total]));
	const changes = current.map((slice) => toChange(slice.categoryId, slice.total, previousTotals.get(slice.categoryId) ?? 0));

	const seen = new Set(current.map((slice) => slice.categoryId));
	for (const slice of previous) {
		if (!seen.has(slice.categoryId)) changes.push(toChange(slice.categoryId, 0, slice.total));
	}

	return changes.sort((a, b) => b.current - a.current || b.previous - a.previous);
}

function toChange(categoryId: string, current: number, previous: number): CategoryChange {
	return {
		categoryId,
		current: baht(current),
		previous: baht(previous),
		delta: baht(current - previous)
	};
}

function toBusiestDay(series: Array<{ day: string; expense: number }>): { day: string; expense: number } | null {
	let busiest: { day: string; expense: number } | null = null;
	for (const point of series) {
		if (point.expense > 0 && (!busiest || point.expense > busiest.expense)) {
			busiest = { day: point.day, expense: baht(point.expense) };
		}
	}
	return busiest;
}

/** Satang precision, so floating-point noise cannot change the fingerprint. */
function baht(amount: number): number {
	return Math.round(amount * 100) / 100;
}
