import { buildCashflowCalendar } from '$lib/cashflow';
import { billDueDate } from '$lib/bills';
import { resolveMonthSelection } from '$lib/month';
import { toNumber } from '$lib/utils/money';
import { bangkokDayKey, bangkokMonthKey, bangkokParts, fromBangkok } from '$lib/utils/date';
import { requireUserId } from '$lib/server/auth';
import { listBills, listDeferredBillPayments, updateBill } from '$lib/server/db/bills';
import { getMonthClosure, previousMonthKey } from '$lib/server/db/month-close';
import { getMonthlyPlan } from '$lib/server/db/plans';
import { getDailyCashflowSeries } from '$lib/server/db/queries';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

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
		return dueDate && bangkokMonthKey(dueDate) <= month.key ? [{ id: bill.id, name: bill.name, amount: bill.amount, dueDate, recurrence: bill.recurrence }] : [];
	});
	const moveBillId = Number(url.searchParams.get('moveBill'));
	const previewBill = Number.isInteger(moveBillId) ? unpaidBills.find((bill) => bill.id === moveBillId) : undefined;
	const rawMoveDate = url.searchParams.get('moveTo');
	let moveTo: Date | null = null;
	if (previewBill && rawMoveDate) {
		const [year, monthNumber, day] = rawMoveDate.split('-').map(Number);
		if (year === Number(month.key.slice(0, 4)) && monthNumber === Number(month.key.slice(5, 7)) && day >= 1 && day <= month.daysInMonth) {
			const candidate = fromBangkok(year, monthNumber, day, 9);
			const parts = bangkokParts(candidate);
			if (parts.year === year && parts.month === monthNumber && parts.day === day) moveTo = candidate;
		}
	}
	const displayedBills = unpaidBills.map((bill) => ({ ...bill, dueDate: previewBill?.id === bill.id && moveTo ? moveTo : bill.dueDate }));
	const currentDay = month.isCurrent ? bangkokParts(now).day : month.daysInMonth;
	const carryover = previousClosure ? toNumber(previousClosure.carryoverAmount) : 0;
	const calendar = buildCashflowCalendar({
		year: Number(month.key.slice(0, 4)), month: Number(month.key.slice(5, 7)),
		openingBalance: carryover, plannedIncome: toNumber(plan?.expectedIncome ?? 0),
		plannedIncomeDay: plan?.expectedIncomeDay ?? 1, actualDays, unpaidBills: displayedBills, settlements,
		currentDay, isCurrentMonth: month.isCurrent
	});
	const actualIncome = actualDays.reduce((sum, day) => sum + day.income, 0);
	const actualExpense = actualDays.reduce((sum, day) => sum + day.expense, 0) + settlements.reduce((sum, bill) => sum + bill.amount, 0);
	const unpaidTotal = unpaidBills.reduce((sum, bill) => sum + bill.amount, 0);
	return {
		month, days: calendar.days, weekdayOffset: calendar.weekdayOffset, lowestDay: calendar.lowestDay,
		plannedIncome: calendar.forecastIncome, expectedIncomeDay: plan?.expectedIncomeDay ?? null,
		actualIncome, actualExpense, unpaidTotal, unpaidCount: unpaidBills.length, carryover,
		currentDay, hasOpeningBalance: Boolean(previousClosure),
		previewBill: previewBill ? { id: previewBill.id, name: previewBill.name, dueDate: bangkokDayKey(moveTo ?? previewBill.dueDate), originalDueDate: bangkokDayKey(previewBill.dueDate), recurrence: previewBill.recurrence } : null,
		previewActive: Boolean(previewBill && moveTo)
	};
};

export const actions: Actions = {
	confirmMove: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const id = Number(form.get('billId'));
		const monthKey = String(form.get('month') ?? '');
		const moveTo = String(form.get('moveTo') ?? '');
		const month = resolveMonthSelection(monthKey, new Date());
		const [year, monthNumber, day] = moveTo.split('-').map(Number);
		if (!Number.isInteger(id) || !year || !monthNumber || !day || year !== Number(month.key.slice(0, 4)) || monthNumber !== Number(month.key.slice(5, 7)) || day > month.daysInMonth) return fail(400, { message: 'เลือกวันใหม่ในเดือนที่แสดงอยู่' });
		const date = fromBangkok(year, monthNumber, day, 9);
		const parts = bangkokParts(date);
		if (parts.year !== year || parts.month !== monthNumber || parts.day !== day) return fail(400, { message: 'วันที่ไม่ถูกต้อง' });
		const bill = (await listBills(userId, month.from)).find((item) => item.id === id);
		const oldDueDate = bill && !bill.paid ? billDueDate(bill, month.from) : null;
		if (!bill || !oldDueDate || bangkokMonthKey(oldDueDate) > month.key) return fail(404, { message: 'ไม่พบบิลค้างชำระของเดือนนี้' });
		await updateBill(id, userId, bill.recurrence === 'monthly' ? { dueDay: day, dueDate: null } : { dueDay: null, dueDate: date });
		redirect(303, `/cashflow?month=${month.key}`);
	}
};
