import { fail } from '@sveltejs/kit';
import { analyzeBudget, analyzeCategoryBudgets } from '$lib/budget';
import { EXPENSE_CATEGORIES } from '$lib/categories';
import { billDueDate } from '$lib/bills';
import { assertSelectableMonth, resolveMonthSelection } from '$lib/month';
import { requireUserId } from '$lib/server/auth';
import { listBills } from '$lib/server/db/bills';
import { closeMonth, getMonthClosure, previousMonthKey } from '$lib/server/db/month-close';
import { getMonthlyCategoryBudgets, getMonthlyPlan, replaceMonthlyCategoryBudgets, saveMonthlyPlan } from '$lib/server/db/plans';
import { getByCategory, getPaymentMethodTotal, getTotals } from '$lib/server/db/queries';
import { addMonths, bangkokMonthKey, bangkokParts, fromBangkok } from '$lib/utils/date';
import { toNumber } from '$lib/utils/money';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const userId = requireUserId(locals);
	const now = new Date();
	const month = resolveMonthSelection(url.searchParams.get('month'), now);
	const range = { from: month.from, to: month.to };
	const [plan, totals, slices, bills, creditCardSpent, payLaterSpent, categoryBudgetRows, closure, previousClosure] = await Promise.all([
		getMonthlyPlan(userId, month.key), getTotals(userId, range), getByCategory(userId, range, 'expense'),
		listBills(userId, month.from), getPaymentMethodTotal(userId, range, 'credit_card'),
		getPaymentMethodTotal(userId, range, 'shopee_paylater'), getMonthlyCategoryBudgets(userId, month.key),
		getMonthClosure(userId, month.key), getMonthClosure(userId, previousMonthKey(month.key))
	]);
	const [nextPlan, nextBudgets] = month.next
		? await Promise.all([getMonthlyPlan(userId, month.next), getMonthlyCategoryBudgets(userId, month.next)])
		: [null, []];
	const dueThisMonth = bills.filter((bill) => {
		const due = billDueDate(bill, month.from);
		return !bill.paid && due && bangkokMonthKey(due) <= month.key;
	});
	const unpaidBills = dueThisMonth.filter((bill) => !bill.noExpenseOnPay).reduce((sum, bill) => sum + bill.amount, 0);
	const unpaidCardBills = dueThisMonth.filter((bill) => bill.noExpenseOnPay).reduce((sum, bill) => sum + bill.amount, 0);
	const unpaidManualByCategory = new Map<string, number>();
	for (const bill of dueThisMonth.filter((item) => !item.noExpenseOnPay)) {
		unpaidManualByCategory.set(bill.categoryId, (unpaidManualByCategory.get(bill.categoryId) ?? 0) + bill.amount);
	}
	const categoryBudgets = new Map(categoryBudgetRows.map((row) => [row.categoryId, Number(row.amount)]));
	const categorySpent = new Map(slices.map((row) => [row.categoryId, row.total]));
	const categoryProgress = analyzeCategoryBudgets(EXPENSE_CATEGORIES.map((category) => ({
		categoryId: category.id,
		budget: categoryBudgets.get(category.id) ?? 0,
		spent: (categorySpent.get(category.id) ?? 0) + (unpaidManualByCategory.get(category.id) ?? 0)
	})), month.isCurrent ? bangkokParts(now).day : month.daysInMonth, month.daysInMonth);
	const values = {
		expectedIncome: toNumber(plan?.expectedIncome ?? 0), expectedIncomeDay: plan?.expectedIncomeDay ?? 1, savingsGoal: toNumber(plan?.savingsGoal ?? 0),
		foodDailyBudget: toNumber(plan?.foodDailyBudget ?? 0), commuteDailyBudget: toNumber(plan?.commuteDailyBudget ?? 0),
		commuteDays: plan?.commuteDays ?? 0,
		budgetAlertsEnabled: plan?.budgetAlertsEnabled ?? true
	};
	const carryover = previousClosure ? {
		mode: previousClosure.carryoverMode,
		amount: toNumber(previousClosure.carryoverAmount),
		fromMonth: previousClosure.month
	} : null;
	const effectiveValues = {
		...values,
		expectedIncome: values.expectedIncome + (carryover?.mode === 'spendable' ? carryover.amount : 0),
		savingsGoal: values.savingsGoal + (carryover?.mode === 'savings' ? carryover.amount : 0)
	};
	const currentDay = month.isCurrent ? bangkokParts(now).day : month.daysInMonth;
	const foodSpent = slices.find((x) => x.categoryId === 'food')?.total ?? 0;
	const commuteSpent = slices.find((x) => x.categoryId === 'transport')?.total ?? 0;
	const actualRemaining = totals.income - Math.max(0, totals.expense - creditCardSpent - payLaterSpent) - unpaidBills - unpaidCardBills;
	return { month, values, expense: totals.expense, income: totals.income, creditCardSpent, payLaterSpent, unpaidBills, unpaidCardBills,
		actualRemaining, foodSpent, commuteSpent, categoryProgress, analysis: analyzeBudget({ ...effectiveValues, expense: totals.expense,
		foodSpent,
		commuteSpent,
		cashExpense: Math.max(0, totals.expense - creditCardSpent - payLaterSpent),
		unpaidBills, unpaidCardBills, currentDay, daysInMonth: month.daysInMonth }),
		carryover, closure, nextPlanExists: Boolean(nextPlan), nextBudgetCount: nextBudgets.length };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const number = (key: string) => Number(form.get(key));
		const month = String(form.get('month'));
		const values = { expectedIncome: number('expectedIncome'), expectedIncomeDay: number('expectedIncomeDay'), savingsGoal: number('savingsGoal'),
			foodDailyBudget: number('foodDailyBudget'), commuteDailyBudget: number('commuteDailyBudget'), commuteDays: number('commuteDays'),
			budgetAlertsEnabled: form.get('budgetAlertsEnabled') === 'on' };
		try { assertSelectableMonth(month); } catch { return fail(400, { message: 'เดือนไม่ถูกต้อง' }); }
		const numericValues = [values.expectedIncome, values.savingsGoal, values.foodDailyBudget, values.commuteDailyBudget, values.commuteDays];
		if (numericValues.some((value) => !Number.isFinite(value) || value < 0) || !Number.isInteger(values.expectedIncomeDay) || values.expectedIncomeDay < 1 || values.expectedIncomeDay > 31 || !Number.isInteger(values.commuteDays) || values.commuteDays > 31) {
			return fail(400, { message: 'ตัวเลขไม่ถูกต้อง' });
		}
		await saveMonthlyPlan({ userId, month, expectedIncome: values.expectedIncome.toFixed(2), expectedIncomeDay: values.expectedIncomeDay, savingsGoal: values.savingsGoal.toFixed(2),
			foodDailyBudget: values.foodDailyBudget.toFixed(2), commuteDailyBudget: values.commuteDailyBudget.toFixed(2), commuteDays: values.commuteDays,
			budgetAlertsEnabled: values.budgetAlertsEnabled });
		return { message: 'บันทึกแผนเดือนนี้แล้ว' };
	},
	budgets: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const month = String(form.get('month') ?? '');
		try { assertSelectableMonth(month); } catch { return fail(400, { message: 'เดือนไม่ถูกต้อง' }); }
		const values = EXPENSE_CATEGORIES.map((category) => {
			const amount = Number(form.get(`budget_${category.id}`));
			return { categoryId: category.id, amount };
		});
		if (values.some((item) => !Number.isFinite(item.amount) || item.amount < 0 || item.amount > 1_000_000_000)) {
			return fail(400, { message: 'ตรวจยอดงบประมาณทุกหมวดอีกครั้ง' });
		}
		await replaceMonthlyCategoryBudgets(userId, month, values.map((item) => ({ categoryId: item.categoryId, amount: item.amount.toFixed(2) })));
		return { message: 'บันทึกงบรายหมวดแล้ว' };
	},
	copyBudgets: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const month = String((await request.formData()).get('month') ?? '');
		try { assertSelectableMonth(month); } catch { return fail(400, { message: 'เดือนไม่ถูกต้อง' }); }
		const [year, monthNumber] = month.split('-').map(Number);
		const previous = bangkokMonthKey(addMonths(fromBangkok(year, monthNumber, 1), -1));
		const rows = await getMonthlyCategoryBudgets(userId, previous);
		if (!rows.length) return fail(404, { message: `ไม่พบงบที่ตั้งไว้ในเดือน ${previous}` });
		await replaceMonthlyCategoryBudgets(userId, month, rows.map((row) => ({ categoryId: row.categoryId, amount: row.amount })));
		return { message: `คัดลอกงบจาก ${previous} แล้ว` };
	},
	closeMonth: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const monthKey = String(form.get('month') ?? '');
		let month;
		try { month = resolveMonthSelection(monthKey, new Date()); assertSelectableMonth(monthKey); }
		catch { return fail(400, { message: 'เดือนไม่ถูกต้อง' }); }
		if (monthKey >= bangkokMonthKey(new Date())) return fail(400, { message: 'ปิดเดือนได้หลังจากเดือนนั้นสิ้นสุดแล้วเท่านั้น' });
		const carryoverMode = String(form.get('carryoverMode') ?? 'none');
		if (!['spendable', 'savings', 'none'].includes(carryoverMode)) return fail(400, { message: 'วิธียกยอดไม่ถูกต้อง' });
		const [year, monthNumber] = monthKey.split('-').map(Number);
		const nextMonth = bangkokMonthKey(addMonths(fromBangkok(year, monthNumber, 1), 1));
		const range = { from: month.from, to: month.to };
		const [plan, budgets, totals, categories, bills, cardSpent, payLaterSpent] = await Promise.all([
			getMonthlyPlan(userId, monthKey), getMonthlyCategoryBudgets(userId, monthKey), getTotals(userId, range),
			getByCategory(userId, range, 'expense'), listBills(userId, month.from),
			getPaymentMethodTotal(userId, range, 'credit_card'), getPaymentMethodTotal(userId, range, 'shopee_paylater')
		]);
		const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
		const monthEnd = fromBangkok(year, monthNumber, lastDay, 23, 59);
		const unpaid = bills.filter((bill) => {
			const due = billDueDate(bill, month.from);
			return !bill.paid && due && due <= monthEnd;
		});
		const unpaidManual = unpaid.filter((bill) => !bill.noExpenseOnPay).reduce((sum, bill) => sum + bill.amount, 0);
		const unpaidCard = unpaid.filter((bill) => bill.noExpenseOnPay).reduce((sum, bill) => sum + bill.amount, 0);
		const remaining = totals.income - Math.max(0, totals.expense - cardSpent - payLaterSpent) - unpaidManual - unpaidCard;
		const now = new Date();
		const snapshot = {
			income: totals.income, expense: totals.expense, remaining,
			unpaidBills: unpaid.reduce((sum, bill) => sum + bill.amount, 0), unpaidBillCount: unpaid.length,
			categorySpend: categories.map((row) => ({ categoryId: row.categoryId, amount: row.total })),
			refreshedAt: now.toISOString()
		};
		const copyPlan = form.get('copyPlan') === 'on' && plan ? {
			expectedIncome: plan.expectedIncome, expectedIncomeDay: plan.expectedIncomeDay, savingsGoal: plan.savingsGoal, foodDailyBudget: plan.foodDailyBudget,
			commuteDailyBudget: plan.commuteDailyBudget, commuteDays: plan.commuteDays,
			budgetAlertsEnabled: plan.budgetAlertsEnabled
		} : null;
		const copyBudgets = form.get('copyBudgets') === 'on' ? budgets.map((row) => ({ categoryId: row.categoryId, amount: row.amount })) : [];
		const carryBills = form.get('carryBills') === 'on' ? unpaid : [];
		try {
			const result = await closeMonth({
				userId, month: monthKey, nextMonth, snapshot,
				carryoverMode: carryoverMode as 'spendable' | 'savings' | 'none',
				carryoverAmount: Math.max(0, remaining), plan: copyPlan, budgets: copyBudgets, unpaidBills: carryBills
			});
			return { message: result.status === 'closed'
				? `ปิดเดือน ${monthKey} แล้ว · เตรียมแผน ${nextMonth}${result.carriedBillCount ? ` · ยกบิลค้าง ${result.carriedBillCount} รายการ` : ''}`
				: `ปรับสรุปเดือน ${monthKey} ล่าสุดแล้ว · แก้แผน ${nextMonth} ได้จากหน้าแผนเดือน`, closeResult: result.status };
		} catch {
			return fail(500, { message: 'ปิดเดือนไม่สำเร็จ ลองอีกครั้งได้โดยไม่สร้างรายการซ้ำ' });
		}
	}
};
