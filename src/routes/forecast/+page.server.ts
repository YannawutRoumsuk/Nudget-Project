import { categoryLabel, getCategory, isFixedExpenseCategory } from '$lib/categories';
import { billDueDate } from '$lib/bills';
import { forecastMonth } from '$lib/monthly-forecast';
import { monthlyGoalReserve, roundMoney } from '$lib/savings-goals';
import { resolveMonthSelection } from '$lib/month';
import { buildSpendingProfile } from '$lib/analytics';
import { requireUserId } from '$lib/server/auth';
import { listBills } from '$lib/server/db/bills';
import { getMonthClosure, previousMonthKey } from '$lib/server/db/month-close';
import { listSavingsGoals } from '$lib/server/db/savings-goals';
import { getMonthlyCategoryBudgets, getMonthlyPlan } from '$lib/server/db/plans';
import { getByCategory, getTotals, listTransactions } from '$lib/server/db/queries';
import { addMonths, bangkokMonthKey, bangkokParts, daysInBangkokMonth } from '$lib/utils/date';
import { toNumber } from '$lib/utils/money';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = requireUserId(locals);
	const now = new Date();
	const month = resolveMonthSelection(url.searchParams.get('month'), now);
	const range = { from: month.from, to: month.to };
	const previousRanges = [1, 2, 3].map((offset) => {
		const from = addMonths(month.from, -offset);
		return { from, to: addMonths(from, 1), days: daysInBangkokMonth(from) };
	});
	const [actualTotals, baselineTotals, baselineSlices, historySlices, bills, plan, budgets, closure, goals, transactions] = await Promise.all([
		getTotals(userId, range), getTotals(userId, range, undefined, true),
		getByCategory(userId, range, 'expense', undefined, true),
		Promise.all(previousRanges.map((past) => getByCategory(userId, past, 'expense', undefined, true))),
		listBills(userId, month.from), getMonthlyPlan(userId, month.key), getMonthlyCategoryBudgets(userId, month.key),
		getMonthClosure(userId, previousMonthKey(month.key)), listSavingsGoals(userId),
		listTransactions(userId, range, { kind: 'expense', limit: 100 })
	]);
	const currentDay = month.isCurrent ? bangkokParts(now).day : month.daysInMonth;
	const baselineByCategory = new Map(baselineSlices.map((row) => [row.categoryId, row.total]));
	const fixedActual = baselineSlices.filter((row) => isFixedExpenseCategory(row.categoryId)).reduce((sum, row) => sum + row.total, 0);
	const variableActual = baselineSlices.filter((row) => !isFixedExpenseCategory(row.categoryId)).reduce((sum, row) => sum + row.total, 0);
	const specialActual = Math.max(0, actualTotals.expense - baselineTotals.expense);
	const historicalVariablePerDay = historySlices.map((slices, index) => {
		const profile = buildSpendingProfile(slices, previousRanges[index].days);
		return profile.regular / previousRanges[index].days;
	});
	const unpaid = bills.flatMap((bill) => {
		if (bill.paid) return [];
		const due = billDueDate(bill, month.from);
		return due && bangkokMonthKey(due) <= month.key ? [{ ...bill, due }] : [];
	});
	const knownFixedBills = unpaid.filter((bill) => !bill.noExpenseOnPay && isFixedExpenseCategory(bill.categoryId)).reduce((sum, bill) => sum + bill.amount, 0);
	const knownVariableBills = unpaid.filter((bill) => !bill.noExpenseOnPay && !isFixedExpenseCategory(bill.categoryId)).reduce((sum, bill) => sum + bill.amount, 0);
	const cardPayables = unpaid.filter((bill) => bill.noExpenseOnPay).reduce((sum, bill) => sum + bill.amount, 0);
	const currentIncome = actualTotals.income;
	const openingBalance = closure ? toNumber(closure.carryoverAmount) : 0;
	const monthlyBudgetTotal = budgets.reduce((sum, row) => sum + toNumber(row.amount), 0);
	const goalReserve = month.isCurrent ? roundMoney(goals.filter((goal) => goal.status === 'active').reduce((sum, goal) => sum + monthlyGoalReserve({
		name: goal.name, targetAmount: toNumber(goal.targetAmount), currentAmount: toNumber(goal.currentAmount), targetDate: goal.targetDate,
		monthlyContribution: toNumber(goal.monthlyContribution)
	}, now), 0)) : 0;
	const forecast = forecastMonth({
		year: Number(month.key.slice(0, 4)), month: Number(month.key.slice(5, 7)), currentDay, daysInMonth: month.daysInMonth,
		isCurrentMonth: month.isCurrent, actualIncome: currentIncome, expectedIncome: toNumber(plan?.expectedIncome ?? 0), openingBalance,
		fixedActual, variableActual, specialActual, knownFixedBills, knownVariableBills, cardPayables,
		historicalVariablePerDay, monthlyBudget: monthlyBudgetTotal > 0 ? monthlyBudgetTotal : null,
		savingsGoal: toNumber(plan?.savingsGoal ?? 0) + goalReserve
	});
	const baseCurrentTotal = baselineSlices.reduce((sum, row) => sum + row.total, 0);
	const specialTransactions = transactions.filter((tx) => !isFixedExpenseCategory(tx.categoryId)).slice(0, 20).map((tx) => {
		const category = getCategory(tx.categoryId);
		return { id: tx.id, note: tx.note || categoryLabel(tx.categoryId), amount: toNumber(tx.amount), occurredAt: tx.occurredAt,
			excluded: tx.excludeFromBaseline, category: category?.nameTh ?? tx.categoryId };
	});
	return { month, forecast, hasPlan: Boolean(plan), hasBudget: monthlyBudgetTotal > 0, actualExpense: actualTotals.expense,
		actualIncome: currentIncome, fixedActual, variableActual, specialActual, knownFixedBills, knownVariableBills, cardPayables,
		goalReserve, baselineExpense: baseCurrentTotal, specialTransactions };
};
