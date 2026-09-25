import { categoryLabel, getCategory } from '$lib/categories';
import { toNumber } from '$lib/utils/money';

export interface ReportSlice { categoryId: string; total: number; }
export interface ReportBudget { categoryId: string; amount: string; }
export interface ReportCategory { id: string; label: string; amount: number; budget: number | null; }

/** Category-level aggregates only; privacy mode intentionally omits all category details. */
export function buildReportCategories(slices: ReportSlice[], budgets: ReportBudget[], privacyMode: boolean): ReportCategory[] {
	if (privacyMode) return [];
	const budgetByCategory = new Map(budgets.map((budget) => [budget.categoryId, toNumber(budget.amount)]));
	return slices.map((slice) => ({ id: slice.categoryId,
		label: getCategory(slice.categoryId)?.nameTh ?? categoryLabel(slice.categoryId),
		amount: slice.total, budget: budgetByCategory.get(slice.categoryId) ?? null
	})).sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id)).slice(0, 8);
}

export function summarizeReportBudgets(slices: ReportSlice[], budgets: ReportBudget[]) {
	if (!budgets.length) return { total: null, over: null };
	const actualByCategory = new Map(slices.map((slice) => [slice.categoryId, slice.total]));
	const total = budgets.reduce((sum, budget) => sum + toNumber(budget.amount), 0);
	const over = budgets.reduce((sum, budget) => sum + Math.max(0,
		(actualByCategory.get(budget.categoryId) ?? 0) - toNumber(budget.amount)), 0);
	return { total: total || null, over: total ? over : null };
}
