import { fail } from '@sveltejs/kit';
import { detectMonthlyRecurring } from '$lib/recurring';
import { categoryLabel } from '$lib/categories';
import { requireUserId } from '$lib/server/auth';
import { decideRecurringCandidate, confirmRecurringCandidate, getRecurringDecisions, restoreRecurringCandidate } from '$lib/server/db/recurring-decisions';
import { listTransactions } from '$lib/server/db/queries';
import { addDays, addMonths, bangkokParts, fromBangkok } from '$lib/utils/date';
import { toNumber } from '$lib/utils/money';
import type { Actions, PageServerLoad } from './$types';

async function getCandidates(userId: number) {
	const now = new Date();
	const current = bangkokParts(now);
	const from = addMonths(fromBangkok(current.year, current.month, 1), -6);
	const transactions = await listTransactions(userId, { from, to: addDays(now, 1) }, { kind: 'expense', limit: 2000 });
	return detectMonthlyRecurring(transactions.map((tx) => ({ id: tx.id, note: tx.note, amount: toNumber(tx.amount),
		categoryId: tx.categoryId, occurredAt: tx.occurredAt, paymentMethod: tx.paymentMethod,
		creditCardId: tx.creditCardId, excluded: tx.excludeFromBaseline })));
}

export const load: PageServerLoad = async ({ locals }) => {
	const userId = requireUserId(locals);
	const [detected, decisions] = await Promise.all([getCandidates(userId), getRecurringDecisions(userId)]);
	const statusByKey = new Map(decisions.map((decision) => [decision.merchantKey, decision.status]));
	const suggestions = detected.filter((candidate) => !statusByKey.has(candidate.merchantKey));
	const hidden = decisions.filter((decision) => decision.status === 'dismissed' || decision.status === 'not_recurring');
	const confirmed = decisions.flatMap((decision) => decision.status === 'confirmed' && decision.billId && decision.billActive
		? [{ id: decision.billId, name: decision.billName ?? decision.merchantKey, amount: toNumber(decision.billAmount ?? 0) }]
		: []);
	const monthlyTotal = confirmed.reduce((sum, item) => sum + item.amount, 0);
	return { suggestions: suggestions.map((candidate) => ({ ...candidate, categoryName: categoryLabel(candidate.categoryId) })), hidden, confirmed, monthlyTotal, yearlyTotal: monthlyTotal * 12 };
};

export const actions: Actions = {
	accept: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const key = String((await request.formData()).get('merchantKey') ?? '');
		const candidate = (await getCandidates(userId)).find((row) => row.merchantKey === key);
		if (!candidate) return fail(404, { message: 'ไม่พบคำแนะนำนี้แล้ว กรุณาโหลดหน้าใหม่' });
		const bill = await confirmRecurringCandidate(userId, candidate);
		return bill ? { message: `ยืนยันแล้ว เพิ่มบิลรายเดือน “${bill.name}” เรียบร้อย` } : fail(409, { message: 'รายการนี้มีบิลยืนยันอยู่แล้ว' });
	},
	dismiss: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const key = String(form.get('merchantKey') ?? '');
		const status = String(form.get('status'));
		if (!['dismissed', 'not_recurring'].includes(status) || !(await getCandidates(userId)).some((row) => row.merchantKey === key)) {
			return fail(400, { message: 'คำแนะนำนี้ไม่ถูกต้องหรือหมดอายุแล้ว' });
		}
		const saved = await decideRecurringCandidate(userId, key, status as 'dismissed' | 'not_recurring');
		return saved ? { message: status === 'not_recurring' ? 'บันทึกว่าไม่ใช่รายการประจำแล้ว' : 'ซ่อนคำแนะนำนี้แล้ว' } : fail(409, { message: 'รายการนี้ถูกยืนยันเป็นบิลแล้ว' });
	},
	restore: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const key = String((await request.formData()).get('merchantKey') ?? '');
		const restored = await restoreRecurringCandidate(userId, key);
		return restored ? { message: 'เปิดคำแนะนำอีกครั้งแล้ว' } : fail(404, { message: 'ไม่พบคำแนะนำที่ซ่อนไว้' });
	}
};
