import { fail } from '@sveltejs/kit';
import { analyzeBudget, analyzeCategoryBudgets } from '$lib/budget';
import { EXPENSE_CATEGORIES } from '$lib/categories';
import { billDueDate } from '$lib/bills';
import { assertSelectableMonth, resolveMonthSelection } from '$lib/month';
import { requireUserId } from '$lib/server/auth';
import { listBills } from '$lib/server/db/bills';
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
	const [plan, totals, slices, bills, creditCardSpent, payLaterSpent, categoryBudgetRows] = await Promise.all([
		getMonthlyPlan(userId, month.key), getTotals(userId, range), getByCategory(userId, range, 'expense'),
		listBills(userId, month.from), getPaymentMethodTotal(userId, range, 'credit_card'),
		getPaymentMethodTotal(userId, range, 'shopee_paylater'), getMonthlyCategoryBudgets(userId, month.key)
	]);
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
		expectedIncome: toNumber(plan?.expectedIncome ?? 0), savingsGoal: toNumber(plan?.savingsGoal ?? 0),
		foodDailyBudget: toNumber(plan?.foodDailyBudget ?? 0), commuteDailyBudget: toNumber(plan?.commuteDailyBudget ?? 0),
		commuteDays: plan?.commuteDays ?? 0,
		budgetAlertsEnabled: plan?.budgetAlertsEnabled ?? true
	};
	const currentDay = month.isCurrent ? bangkokParts(now).day : month.daysInMonth;
	const foodSpent = slices.find((x) => x.categoryId === 'food')?.total ?? 0;
	const commuteSpent = slices.find((x) => x.categoryId === 'transport')?.total ?? 0;
	return { month, values, expense: totals.expense, income: totals.income, creditCardSpent, payLaterSpent, unpaidBills, unpaidCardBills,
		foodSpent, commuteSpent, categoryProgress, analysis: analyzeBudget({ ...values, expense: totals.expense,
		foodSpent,
		commuteSpent,
		cashExpense: Math.max(0, totals.expense - creditCardSpent - payLaterSpent),
		unpaidBills, unpaidCardBills, currentDay, daysInMonth: month.daysInMonth }) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const number = (key: string) => Number(form.get(key));
		const month = String(form.get('month'));
		const values = { expectedIncome: number('expectedIncome'), savingsGoal: number('savingsGoal'),
			foodDailyBudget: number('foodDailyBudget'), commuteDailyBudget: number('commuteDailyBudget'), commuteDays: number('commuteDays'),
			budgetAlertsEnabled: form.get('budgetAlertsEnabled') === 'on' };
		try { assertSelectableMonth(month); } catch { return fail(400, { message: 'เดือนไม่ถูกต้อง' }); }
		const numericValues = [values.expectedIncome, values.savingsGoal, values.foodDailyBudget, values.commuteDailyBudget, values.commuteDays];
		if (numericValues.some((value) => !Number.isFinite(value) || value < 0) || !Number.isInteger(values.commuteDays) || values.commuteDays > 31) {
			return fail(400, { message: 'ตัวเลขไม่ถูกต้อง' });
		}
		await saveMonthlyPlan({ userId, month, expectedIncome: values.expectedIncome.toFixed(2), savingsGoal: values.savingsGoal.toFixed(2),
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
	}
};
