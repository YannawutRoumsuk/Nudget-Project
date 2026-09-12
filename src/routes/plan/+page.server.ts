import { fail } from '@sveltejs/kit';
import { analyzeBudget } from '$lib/budget';
import { assertSelectableMonth, resolveMonthSelection } from '$lib/month';
import { requireUserId } from '$lib/server/auth';
import { getUnpaidBillTotal } from '$lib/server/db/bills';
import { getMonthlyPlan, saveMonthlyPlan } from '$lib/server/db/plans';
import { getByCategory, getPaymentMethodTotal, getTotals } from '$lib/server/db/queries';
import { bangkokParts } from '$lib/utils/date';
import { toNumber } from '$lib/utils/money';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const userId = requireUserId(locals);
	const now = new Date();
	const month = resolveMonthSelection(url.searchParams.get('month'), now);
	const range = { from: month.from, to: month.to };
	const [plan, totals, slices, unpaidBills, creditCardSpent] = await Promise.all([
		getMonthlyPlan(userId, month.key), getTotals(userId, range), getByCategory(userId, range, 'expense'),
		getUnpaidBillTotal(userId, month.from), getPaymentMethodTotal(userId, range, 'credit_card')
	]);
	const values = {
		expectedIncome: toNumber(plan?.expectedIncome ?? 0), savingsGoal: toNumber(plan?.savingsGoal ?? 0),
		foodDailyBudget: toNumber(plan?.foodDailyBudget ?? 0), commuteDailyBudget: toNumber(plan?.commuteDailyBudget ?? 0),
		commuteDays: plan?.commuteDays ?? 0
	};
	const currentDay = month.isCurrent ? bangkokParts(now).day : month.daysInMonth;
	return { month, values, expense: totals.expense, creditCardSpent, analysis: analyzeBudget({ ...values, expense: totals.expense,
		foodSpent: slices.find((x) => x.categoryId === 'food')?.total ?? 0,
		commuteSpent: slices.find((x) => x.categoryId === 'transport')?.total ?? 0,
		unpaidBills, currentDay, daysInMonth: month.daysInMonth }) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const number = (key: string) => Number(form.get(key));
		const month = String(form.get('month'));
		const values = { expectedIncome: number('expectedIncome'), savingsGoal: number('savingsGoal'),
			foodDailyBudget: number('foodDailyBudget'), commuteDailyBudget: number('commuteDailyBudget'), commuteDays: number('commuteDays') };
		try { assertSelectableMonth(month); } catch { return fail(400, { message: 'เดือนไม่ถูกต้อง' }); }
		if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0) || !Number.isInteger(values.commuteDays) || values.commuteDays > 31) {
			return fail(400, { message: 'ตัวเลขไม่ถูกต้อง' });
		}
		await saveMonthlyPlan({ userId, month, expectedIncome: values.expectedIncome.toFixed(2), savingsGoal: values.savingsGoal.toFixed(2),
			foodDailyBudget: values.foodDailyBudget.toFixed(2), commuteDailyBudget: values.commuteDailyBudget.toFixed(2), commuteDays: values.commuteDays });
		return { message: 'บันทึกแผนเดือนนี้แล้ว' };
	}
};
