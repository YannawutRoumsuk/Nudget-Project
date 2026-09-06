import { fail } from '@sveltejs/kit';
import { analyzeBudget } from '$lib/budget';
import { requireUserId } from '$lib/server/auth';
import { getUnpaidBillTotal } from '$lib/server/db/bills';
import { getMonthlyPlan, saveMonthlyPlan } from '$lib/server/db/plans';
import { getByCategory, getPaymentMethodTotal, getTotals } from '$lib/server/db/queries';
import { addMonths, bangkokMonthKey, bangkokMonthStart, bangkokParts, daysInBangkokMonth } from '$lib/utils/date';
import { toNumber } from '$lib/utils/money';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = requireUserId(locals);
	const now = new Date();
	const month = bangkokMonthKey(now);
	const from = bangkokMonthStart(now);
	const range = { from, to: addMonths(from, 1) };
	const [plan, totals, slices, unpaidBills, creditCardSpent] = await Promise.all([
		getMonthlyPlan(userId, month), getTotals(userId, range), getByCategory(userId, range, 'expense'),
		getUnpaidBillTotal(userId, now), getPaymentMethodTotal(userId, range, 'credit_card')
	]);
	const values = {
		expectedIncome: toNumber(plan?.expectedIncome ?? 0), savingsGoal: toNumber(plan?.savingsGoal ?? 0),
		foodDailyBudget: toNumber(plan?.foodDailyBudget ?? 0), commuteDailyBudget: toNumber(plan?.commuteDailyBudget ?? 0),
		commuteDays: plan?.commuteDays ?? 0
	};
	const { day } = bangkokParts(now);
	return { month, values, creditCardSpent, analysis: analyzeBudget({ ...values, expense: totals.expense,
		foodSpent: slices.find((x) => x.categoryId === 'food')?.total ?? 0,
		commuteSpent: slices.find((x) => x.categoryId === 'transport')?.total ?? 0,
		unpaidBills, currentDay: day, daysInMonth: daysInBangkokMonth(now) }) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const number = (key: string) => Number(form.get(key));
		const month = String(form.get('month'));
		const values = { expectedIncome: number('expectedIncome'), savingsGoal: number('savingsGoal'),
			foodDailyBudget: number('foodDailyBudget'), commuteDailyBudget: number('commuteDailyBudget'), commuteDays: number('commuteDays') };
		if (!/^\d{4}-\d{2}$/.test(month) || Object.values(values).some((value) => !Number.isFinite(value) || value < 0) || !Number.isInteger(values.commuteDays) || values.commuteDays > 31) {
			return fail(400, { message: 'ตัวเลขไม่ถูกต้อง' });
		}
		await saveMonthlyPlan({ userId, month, expectedIncome: values.expectedIncome.toFixed(2), savingsGoal: values.savingsGoal.toFixed(2),
			foodDailyBudget: values.foodDailyBudget.toFixed(2), commuteDailyBudget: values.commuteDailyBudget.toFixed(2), commuteDays: values.commuteDays });
		return { message: 'บันทึกแผนเดือนนี้แล้ว' };
	}
};
