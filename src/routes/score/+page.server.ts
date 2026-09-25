import { resolveMonthSelection } from '$lib/month';
import { calculateFinancialHealth, type FinancialHealthInput } from '$lib/financial-health';
import { billDueDate } from '$lib/bills';
import { requireUserId } from '$lib/server/auth';
import { listBills } from '$lib/server/db/bills';
import { getByCategory, getTotals, listTransactions } from '$lib/server/db/queries';
import { listSavingsGoals } from '$lib/server/db/savings-goals';
import { getMonthlyCategoryBudgets, getMonthlyPlan } from '$lib/server/db/plans';
import { addMonths, bangkokDayKey, bangkokMonthKey, bangkokParts } from '$lib/utils/date';
import { toNumber } from '$lib/utils/money';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const userId = requireUserId(locals);
	const now = new Date();
	const month = resolveMonthSelection(url.searchParams.get('month'), now);
	const previous = resolveMonthSelection(month.previous, now);
	const [currentPeriod, previousPeriod, billRows, previousBillRows, goals] = await Promise.all([
		loadPeriod(userId, month), loadPeriod(userId, previous), listBills(userId, month.from), listBills(userId, previous.from), listSavingsGoals(userId)
	]);
	const historyMonths = [1, 2, 3, 4].map((offset) => {
		const start = addMonths(month.from, -offset);
		return resolveMonthSelection(bangkokMonthKey(start), now);
	});
	const history = await Promise.all(historyMonths.map(async (selection) => getTotals(userId, selection)));
	const currentExpenseHistory = history.slice(0, 3).filter((row) => row.count > 0 && row.expense > 0).map((row) => row.expense);
	const previousExpenseHistory = history.slice(1, 4).filter((row) => row.count > 0 && row.expense > 0).map((row) => row.expense);
	const expenseAverage = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
	const emergencyGoalRows = goals.filter((goal) => goal.goalType === 'emergency' && goal.status !== 'closed');
	const emergencyBalance = emergencyGoalRows.length ? emergencyGoalRows.reduce((sum, goal) => sum + toNumber(goal.currentAmount), 0) : null;
	const monthlyBills = (rows: typeof billRows, selection: typeof month) => rows.length ? rows.reduce((sum, bill) => {
		const due = billDueDate(bill, selection.from);
		return due && bangkokMonthKey(due) === selection.key ? sum + bill.amount : sum;
	}, 0) : null;
	const currentIncome = incomeBaseline(currentPeriod.totals.income, currentPeriod.planIncome);
	const previousIncome = incomeBaseline(previousPeriod.totals.income, previousPeriod.planIncome);
	const scoreFor = (period: PeriodData, income: number | null, averageExpense: number | null, bills: number | null): FinancialHealthInput => ({
		income: period.totals.count > 0 ? income : null,
		expense: period.totals.count > 0 ? period.totals.expense : null,
		budgets: period.totals.count > 0 && period.budgets.length ? period.budgets : null,
		monthlyBills: bills,
		emergencyBalance,
		averageMonthlyExpense: averageExpense,
		recordedDays: period.recordedDays,
		elapsedDays: period.elapsedDays
	});
	const currentScore = calculateFinancialHealth(scoreFor(currentPeriod, currentIncome, expenseAverage(currentExpenseHistory), monthlyBills(billRows, month)));
	const previousScore = calculateFinancialHealth(scoreFor(previousPeriod, previousIncome, expenseAverage(previousExpenseHistory), monthlyBills(previousBillRows, previous)));
	const monthUrl = (path: string) => `${path}?month=${encodeURIComponent(month.key)}`;
	return {
		month, currentScore, previousScore,
		scoreChange: currentScore.score !== null && previousScore.score !== null ? currentScore.score - previousScore.score : null,
		isCurrentMonth: month.isCurrent,
		emergencyGoalCount: emergencyGoalRows.length,
		billSourceKnown: billRows.length > 0,
		factors: currentScore.factors.map((factor) => ({ ...factor, previousScore: previousScore.factors.find((previousFactor) => previousFactor.id === factor.id)?.score ?? null, href: factor.href.startsWith('/transactions') || factor.href === '/plan' ? monthUrl(factor.href) : factor.href })),
		recommendations: currentScore.recommendations.map((item) => ({ ...item, href: item.href.startsWith('/transactions') || item.href === '/plan' ? monthUrl(item.href) : item.href }))
	};
};

interface PeriodData {
	totals: Awaited<ReturnType<typeof getTotals>>;
	planIncome: number;
	budgets: Array<{ budget: number; spent: number }>;
	recordedDays: number | null;
	elapsedDays: number;
}

async function loadPeriod(userId: number, month: ReturnType<typeof resolveMonthSelection>): Promise<PeriodData> {
	const range = { from: month.from, to: month.to };
	const [totals, categories, budgets, transactions, plan] = await Promise.all([
		getTotals(userId, range), getByCategory(userId, range, 'expense'), getMonthlyCategoryBudgets(userId, month.key),
		listTransactions(userId, range, { limit: 2000 }), getMonthlyPlan(userId, month.key)
	]);
	const spentByCategory = new Map(categories.map((item) => [item.categoryId, item.total]));
	const configuredBudgets = budgets.map((item) => ({ budget: toNumber(item.amount), spent: spentByCategory.get(item.categoryId) ?? 0 }))
		.filter((item) => item.budget > 0);
	const distinctDays = new Set(transactions.map((tx) => bangkokDayKey(tx.occurredAt)));
	const elapsedDays = month.isCurrent ? bangkokParts(new Date()).day : month.daysInMonth;
	return { totals, planIncome: toNumber(plan?.expectedIncome ?? 0), budgets: configuredBudgets,
		recordedDays: distinctDays.size ? distinctDays.size : null, elapsedDays };
}

function incomeBaseline(actual: number, planned: number): number | null {
	if (actual > 0) return actual;
	return planned > 0 ? planned : null;
}
