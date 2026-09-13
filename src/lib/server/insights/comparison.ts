import { categoryLabel } from '$lib/categories';
import { detectSpendingAnomalies } from '$lib/insights';
import type { ComparisonSource, SpendingAnomaly } from '$lib/insights';
import { getUnpaidBillTotal } from '$lib/server/db/bills';
import {
	getByCategory,
	getPaymentMethodTotal,
	getTotals,
	listTransactions
} from '$lib/server/db/queries';
import type { Range } from '$lib/server/db/queries';
import type { Transaction } from '$lib/server/db/schema';
import { addDays, addMonths, bangkokDayKey, formatThaiMonthYear } from '$lib/utils/date';
import { toNumber } from '$lib/utils/money';
import type { InsightInput } from './input';

export type BaselineKind = 'previous' | 'average3' | 'yearAgo';

export interface ComparisonMetric {
	id: 'income' | 'expense' | 'savings' | 'creditCard' | 'bills';
	label: string;
	current: number;
	baseline: number;
	delta: number;
	percent: number | null;
}

export interface MultiMonthComparison {
	kind: BaselineKind;
	label: string;
	periodLabel: string;
	availableMonths: number;
	totalMonths: number;
	metrics: ComparisonMetric[];
	categories: ComparisonSource[];
	anomalies: SpendingAnomaly[];
	insufficientCategoryLabels: string[];
}

interface PeriodAggregate {
	income: number;
	expense: number;
	savings: number;
	creditCard: number;
	bills: number;
	count: number;
	categories: Array<{ categoryId: string; total: number }>;
}

export function resolveBaselineKind(value: string | null): BaselineKind {
	return value === 'average3' || value === 'yearAgo' ? value : 'previous';
}

/** Builds all comparison numbers locally. Nothing in this result requires an LLM. */
export async function buildMultiMonthComparison(
	userId: number,
	month: { from: Date; to: Date },
	current: InsightInput,
	kind: BaselineKind
): Promise<MultiMonthComparison> {
	const periods = baselinePeriods(month.from, kind);
	const historyRange = { from: addMonths(month.from, -3), to: month.from };
	const [baselineMonths, currentTransactions, historyTransactions] = await Promise.all([
		Promise.all(periods.map((range) => loadPeriod(userId, range))),
		listTransactions(userId, month, { kind: 'expense', limit: 1_000 }),
		listTransactions(userId, historyRange, { kind: 'expense', limit: 3_000, excludeMarked: true })
	]);

	const baseline = averagePeriods(baselineMonths);
	const anomalyResult = detectSpendingAnomalies(
		currentTransactions.map(toAnomalySource),
		historyTransactions.map(toAnomalySource)
	);

	return {
		kind,
		label: baselineLabel(periods, kind),
		periodLabel: `${bangkokDayKey(periods[0].from)} ถึง ${bangkokDayKey(addDays(periods.at(-1)!.to, -1))}`,
		availableMonths: baselineMonths.filter((item) => item.count > 0).length,
		totalMonths: periods.length,
		metrics: [
			metric('income', 'รายรับ', current.income, baseline.income),
			metric('expense', 'รายจ่าย', current.expense, baseline.expense),
			metric('savings', 'เงินออม', current.savings, baseline.savings),
			metric('creditCard', 'ยอดบัตรเครดิต', current.creditCardSpent, baseline.creditCard),
			metric('bills', 'บิลที่ยังไม่จ่าย', current.unpaidBills, baseline.bills)
		],
		categories: categoryComparison(current.categories, baseline.categories),
		anomalies: anomalyResult.anomalies,
		insufficientCategoryLabels: anomalyResult.insufficientCategories.map(categoryLabel)
	};
}

function baselinePeriods(monthStart: Date, kind: BaselineKind): Range[] {
	const offsets = kind === 'average3' ? [-3, -2, -1] : [kind === 'yearAgo' ? -12 : -1];
	return offsets.map((offset) => {
		const from = addMonths(monthStart, offset);
		return { from, to: addMonths(from, 1) };
	});
}

async function loadPeriod(userId: number, range: Range): Promise<PeriodAggregate> {
	const [totals, categories, creditCard, bills] = await Promise.all([
		getTotals(userId, range, undefined, true),
		getByCategory(userId, range, 'expense', undefined, true),
		getPaymentMethodTotal(userId, range, 'credit_card', undefined, true),
		getUnpaidBillTotal(userId, range.from)
	]);
	return {
		income: totals.income,
		expense: totals.expense,
		savings: Math.max(0, totals.net),
		creditCard,
		bills,
		count: totals.count,
		categories
	};
}

function averagePeriods(periods: PeriodAggregate[]): PeriodAggregate {
	const divisor = periods.length;
	const categoryTotals = new Map<string, number>();
	for (const period of periods) {
		for (const category of period.categories) {
			categoryTotals.set(category.categoryId, (categoryTotals.get(category.categoryId) ?? 0) + category.total);
		}
	}
	const average = (select: (period: PeriodAggregate) => number) =>
		round(periods.reduce((sum, period) => sum + select(period), 0) / divisor);
	return {
		income: average((period) => period.income),
		expense: average((period) => period.expense),
		savings: average((period) => period.savings),
		creditCard: average((period) => period.creditCard),
		bills: average((period) => period.bills),
		count: periods.reduce((sum, period) => sum + period.count, 0),
		categories: [...categoryTotals].map(([categoryId, total]) => ({
			categoryId,
			total: round(total / divisor)
		}))
	};
}

function categoryComparison(
	current: InsightInput['categories'],
	baseline: Array<{ categoryId: string; total: number }>
): ComparisonSource[] {
	const currentMap = new Map(current.map((item) => [item.categoryId, item.current]));
	const baselineMap = new Map(baseline.map((item) => [item.categoryId, item.total]));
	const ids = new Set([...currentMap.keys(), ...baselineMap.keys()]);
	return [...ids].map((categoryId) => {
		const currentAmount = currentMap.get(categoryId) ?? 0;
		const baselineAmount = baselineMap.get(categoryId) ?? 0;
		return {
			categoryId,
			current: currentAmount,
			previous: baselineAmount,
			delta: round(currentAmount - baselineAmount)
		};
	});
}

function metric(
	id: ComparisonMetric['id'],
	label: string,
	current: number,
	baseline: number
): ComparisonMetric {
	const delta = round(current - baseline);
	return {
		id,
		label,
		current,
		baseline,
		delta,
		percent: baseline > 0 ? round((delta / baseline) * 100) : null
	};
}

function baselineLabel(periods: Range[], kind: BaselineKind): string {
	if (kind === 'average3') {
		return `เฉลี่ย 3 เดือน (${formatThaiMonthYear(periods[0].from)}–${formatThaiMonthYear(periods[2].from)})`;
	}
	return kind === 'yearAgo'
		? `เดือนเดียวกันปีก่อน (${formatThaiMonthYear(periods[0].from)})`
		: `เดือนก่อน (${formatThaiMonthYear(periods[0].from)})`;
}

function toAnomalySource(item: Transaction) {
	return {
		id: item.id,
		amount: toNumber(item.amount),
		categoryId: item.categoryId,
		note: item.note,
		occurredAt: item.occurredAt,
		excludeFromBaseline: item.excludeFromBaseline,
		anomalyDismissed: item.anomalyDismissed
	};
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
