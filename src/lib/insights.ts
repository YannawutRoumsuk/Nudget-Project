import { getCategory } from '$lib/categories';
import { formatNumber } from '$lib/utils/money';

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

export type ComparisonSort = 'amount' | 'percent';

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
export function buildComparison(sources: ComparisonSource[], sort: ComparisonSort = 'amount'): ComparisonRow[] {
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
		.sort((a, b) => {
			if (sort === 'percent') {
				const aPercent = a.percent === null ? -1 : Math.abs(a.percent);
				const bPercent = b.percent === null ? -1 : Math.abs(b.percent);
				return bPercent - aPercent || Math.abs(b.delta) - Math.abs(a.delta);
			}
			return Math.abs(b.delta) - Math.abs(a.delta);
		});
}

/** What the savings ideas add up to, for the line under the list. */
export function totalSavings(savings: { monthlySaving: number }[]): number {
	return savings.reduce((sum, idea) => sum + idea.monthlySaving, 0);
}

export interface MonthlyFactsInput {
	income: number;
	expense: number;
	net: number;
	savings: number;
	savingsRate: number | null;
	creditCardSpent: number;
	unpaidBills: number;
	remainingBudget: number | null;
	previousExpense: number;
	plan: { savingsGoal: number } | null;
}

export interface MonthlyFacts {
	status: string;
	highlights: string[];
	attention: string[];
}

/** A complete, deterministic review that stays available without an LLM. */
export function buildMonthlyFacts(input: MonthlyFactsInput): MonthlyFacts {
	const highlights: string[] = [];
	const attention: string[] = [];
	// The same formatter the figures and the charts use, so a number quoted in a
	// sentence cannot disagree with the identical number in a tile above it.
	const money = (value: number) => formatNumber(Math.round(value));

	if (input.income <= 0 && input.expense <= 0) {
		return { status: 'ยังไม่มีข้อมูลพอสำหรับสรุปเดือนนี้', highlights, attention };
	}

	if (input.previousExpense > 0) {
		const delta = input.expense - input.previousExpense;
		if (Math.abs(delta) >= 1) {
			const direction = delta > 0 ? 'เพิ่มขึ้น' : 'ลดลง';
			highlights.push(`รายจ่าย${direction} ${money(Math.abs(delta))} บาทจากเดือนก่อน`);
		}
	}

	if (input.savingsRate !== null) {
		highlights.push(`เหลือเงิน ${money(input.savings)} บาท หรือ ${Math.round(input.savingsRate)}% ของรายรับ`);
	}
	if (input.plan && input.savings >= input.plan.savingsGoal) {
		highlights.push(`ถึงเป้าเงินเก็บ ${money(input.plan.savingsGoal)} บาทแล้ว`);
	}
	if (input.creditCardSpent > 0) {
		attention.push(`ยอดที่บันทึกผ่านบัตรเครดิต ${money(input.creditCardSpent)} บาท`);
	}
	if (input.unpaidBills > 0) {
		attention.push(`ยังมีบิลรอจ่าย ${money(input.unpaidBills)} บาท`);
	}
	if (input.remainingBudget !== null) {
		if (input.remainingBudget >= 0) highlights.push(`งบหลังหักเป้าเงินเก็บและบิลยังเหลือ ${money(input.remainingBudget)} บาท`);
		else attention.push(`ใช้เกินงบหลังกันเงินเก็บและบิล ${money(Math.abs(input.remainingBudget))} บาท`);
	}
	if (input.net < 0) attention.push(`รายจ่ายมากกว่ารายรับ ${money(Math.abs(input.net))} บาท`);

	return {
		status: input.net >= 0 ? 'รายรับยังครอบคลุมรายจ่ายที่บันทึก' : 'รายจ่ายสูงกว่ารายรับที่บันทึก',
		highlights,
		attention
	};
}

export interface AnomalySource {
	id: number;
	amount: number;
	categoryId: string;
	note: string;
	occurredAt: Date;
	excludeFromBaseline: boolean;
	anomalyDismissed: boolean;
}

export interface SpendingAnomaly extends AnomalySource {
	median: number;
	upperFence: number;
	ratio: number;
	sampleSize: number;
}

export interface AnomalyResult {
	anomalies: SpendingAnomaly[];
	insufficientCategories: string[];
}

const MIN_ANOMALY_SAMPLES = 5;

/**
 * Robust high-value detection. Median and IQR do not let one old large bill
 * drag the baseline upwards the way a mean and standard deviation would.
 */
export function detectSpendingAnomalies(
	current: AnomalySource[],
	history: AnomalySource[]
): AnomalyResult {
	const byCategory = new Map<string, number[]>();
	for (const item of history) {
		if (item.excludeFromBaseline || item.amount <= 0) continue;
		const values = byCategory.get(item.categoryId) ?? [];
		values.push(item.amount);
		byCategory.set(item.categoryId, values);
	}

	const insufficient = new Set<string>();
	const anomalies: SpendingAnomaly[] = [];
	for (const item of current) {
		if (item.excludeFromBaseline || item.anomalyDismissed || item.amount <= 0) continue;
		const values = (byCategory.get(item.categoryId) ?? []).sort((a, b) => a - b);
		if (values.length < MIN_ANOMALY_SAMPLES) {
			insufficient.add(item.categoryId);
			continue;
		}
		const median = percentile(values, 0.5);
		const q1 = percentile(values, 0.25);
		const q3 = percentile(values, 0.75);
		const upperFence = Math.max(median * 2, q3 + 1.5 * (q3 - q1));
		if (item.amount > upperFence && item.amount > median) {
			anomalies.push({
				...item,
				median: roundMoney(median),
				upperFence: roundMoney(upperFence),
				ratio: median > 0 ? Math.round((item.amount / median) * 10) / 10 : 0,
				sampleSize: values.length
			});
		}
	}

	return {
		anomalies: anomalies.sort((a, b) => b.amount / b.upperFence - a.amount / a.upperFence),
		insufficientCategories: [...insufficient]
	};
}

function percentile(sorted: number[], fraction: number): number {
	const index = (sorted.length - 1) * fraction;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	if (lower === upper) return sorted[lower];
	return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}
