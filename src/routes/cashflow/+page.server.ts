import { buildCashflowCalendar } from '$lib/cashflow';
import { billDueDate } from '$lib/bills';
import { resolveMonthSelection } from '$lib/month';
import { toNumber } from '$lib/utils/money';
import { bangkokMonthKey, bangkokParts } from '$lib/utils/date';
import { requireUserId } from '$lib/server/auth';
import { listBills, listDeferredBillPayments } from '$lib/server/db/bills';
import { getMonthClosure, previousMonthKey } from '$lib/server/db/month-close';
import { getMonthlyPlan } from '$lib/server/db/plans';
import { getDailyCashflowSeries } from '$lib/server/db/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = requireUserId(locals);
	const now = new Date();
	const month = resolveMonthSelection(url.searchParams.get('month'), now);
	const range = { from: month.from, to: month.to };
	const [actualDays, bills, settlements, plan, previousClosure] = await Promise.all([
		getDailyCashflowSeries(userId, range), listBills(userId, month.from), listDeferredBillPayments(userId, range),
		getMonthlyPlan(userId, month.key), getMonthClosure(userId, previousMonthKey(month.key))
	]);
	const unpaidBills = bills.flatMap((bill) => {
		if (bill.paid) return [];
		const dueDate = billDueDate(bill, month.from);
		return dueDate && bangkokMonthKey(dueDate) <= month.key ? [{ id: bill.id, name: bill.name, amount: bill.amount, dueDate }] : [];
	});
	const currentDay = month.isCurrent ? bangkokParts(now).day : month.daysInMonth;
	const carryover = previousClosure ? toNumber(previousClosure.carryoverAmount) : 0;
	const calendar = buildCashflowCalendar({
		year: Number(month.key.slice(0, 4)), month: Number(month.key.slice(5, 7)),
		openingBalance: carryover, plannedIncome: toNumber(plan?.expectedIncome ?? 0),
		plannedIncomeDay: plan?.expectedIncomeDay ?? 1, actualDays, unpaidBills, settlements,
		currentDay, isCurrentMonth: month.isCurrent
	});
	const actualIncome = actualDays.reduce((sum, day) => sum + day.income, 0);
	const actualExpense = actualDays.reduce((sum, day) => sum + day.expense, 0) + settlements.reduce((sum, bill) => sum + bill.amount, 0);
	const unpaidTotal = unpaidBills.reduce((sum, bill) => sum + bill.amount, 0);
	return {
		month, days: calendar.days, weekdayOffset: calendar.weekdayOffset, lowestDay: calendar.lowestDay,
		plannedIncome: calendar.forecastIncome, expectedIncomeDay: plan?.expectedIncomeDay ?? null,
		actualIncome, actualExpense, unpaidTotal, unpaidCount: unpaidBills.length, carryover,
		currentDay, hasOpeningBalance: Boolean(previousClosure)
	};
};
