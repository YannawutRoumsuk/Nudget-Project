import { analyzeCategoryBudgets } from '$lib/budget';
import { EXPENSE_CATEGORIES } from '$lib/categories';
import { billDueDate } from '$lib/bills';
import { addMonths, bangkokMonthKey, bangkokMonthStart, bangkokParts, daysInBangkokMonth } from '$lib/utils/date';
import { getMonthlyCategoryBudgets, getMonthlyPlan } from './db/plans';
import { listBills } from './db/bills';
import { getByCategory, claimReminderDelivery, releaseReminderDelivery } from './db/queries';
import { pushText } from './line/client';

/** Sends one grouped daily summary for newly reached budget thresholds. */
export async function sendBudgetThresholdAlerts(userId: number, lineUserId: string, now: Date): Promise<void> {
	const month = bangkokMonthKey(now);
	const plan = await getMonthlyPlan(userId, month);
	if (plan?.budgetAlertsEnabled === false) return;
	const budgets = await getMonthlyCategoryBudgets(userId, month);
	if (!budgets.length) return;

	const from = bangkokMonthStart(now);
	const to = addMonths(from, 1);
	const [transactions, bills] = await Promise.all([
		getByCategory(userId, { from, to }, 'expense'),
		listBills(userId, from)
	]);
	const spent = new Map(transactions.map((row) => [row.categoryId, row.total]));
	for (const bill of bills) {
		const due = billDueDate(bill, from);
		if (bill.paid || bill.noExpenseOnPay || !due || bangkokMonthKey(due) !== month) continue;
		spent.set(bill.categoryId, (spent.get(bill.categoryId) ?? 0) + bill.amount);
	}
	const progress = analyzeCategoryBudgets(budgets.map((row) => ({
		categoryId: row.categoryId,
		budget: Number(row.amount),
		spent: spent.get(row.categoryId) ?? 0
	})), bangkokParts(now).day, daysInBangkokMonth(now));
	const fresh: Array<{ categoryId: string; thresholds: number[]; spent: number; budget: number }> = [];
	for (const row of progress) {
		const claimed: number[] = [];
		for (const threshold of row.thresholdsCrossed) {
			const key = `budget:${month}:${row.categoryId}:${threshold}`;
			if (await claimReminderDelivery(key, userId)) claimed.push(threshold);
		}
		if (claimed.length) fresh.push({ categoryId: row.categoryId, thresholds: claimed, spent: row.spent, budget: row.budget });
	}
	if (!fresh.length) return;

	const lines = fresh.map((row) => {
		const category = EXPENSE_CATEGORIES.find((item) => item.id === row.categoryId);
		return `${category?.icon ?? '•'} ${category?.nameTh ?? row.categoryId}: ${row.thresholds.join('% / ')}% · ${Math.round((row.spent / row.budget) * 100)}% (฿${row.spent.toLocaleString('th-TH')} / ฿${row.budget.toLocaleString('th-TH')})`;
	});
	const keys = fresh.flatMap((row) => row.thresholds.map((threshold) => `budget:${month}:${row.categoryId}:${threshold}`));
	try {
		const sent = await pushText(lineUserId, `🔔 เตือนงบรายหมวด\n${lines.join('\n')}\nเปิดแผนเดือนเพื่อดูรายการและปรับงบได้`);
		if (sent) return;
	} catch (error) {
		for (const key of keys) await releaseReminderDelivery(key);
		throw error;
	}
	for (const key of keys) await releaseReminderDelivery(key);
}
