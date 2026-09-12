import { fail } from '@sveltejs/kit';
import { FALLBACK_CATEGORY } from '$lib/categories';
import { buildBreakdown, fillDailySeries, uncategorisedCount } from '$lib/analytics';
import { DEFAULT_RANGE, resolveRange } from '$lib/ranges';
import { resolveMonthSelection } from '$lib/month';
import {
	deleteTransaction,
	getByCategory,
	getDailySeries,
	getTotals,
	insertTransaction,
	listTransactions
} from '$lib/server/db/queries';
import { requireUserId } from '$lib/server/auth';
import { confirmSaved, confirmSavedMany } from '$lib/server/line/messages';
import { parseEntries } from '$lib/server/parser';
import { toTxView } from '$lib/server/views';
import { addDays, bangkokDayKey } from '$lib/utils/date';
import type { Actions, PageServerLoad } from './$types';

const RECENT_LIMIT = 12;

export const load: PageServerLoad = async ({ url, locals }) => {
	const userId = requireUserId(locals);
	const now = new Date();
	const month = resolveMonthSelection(url.searchParams.get('month'), now);
	const rangeId = url.searchParams.get('range') ?? DEFAULT_RANGE;
	const relativeRange = resolveRange(rangeId, now);
	const range = relativeRange.id === 'month' ? month : relativeRange;

	const [totals, expenseSlices, incomeSlices, series, recent] = await Promise.all([
		getTotals(userId, range),
		getByCategory(userId, range, 'expense'),
		getByCategory(userId, range, 'income'),
		getDailySeries(userId, range),
		listTransactions(userId, range, { limit: RECENT_LIMIT })
	]);

	return {
		range: { id: range.id, label: range.label, elapsedDays: range.elapsedDays },
		month,
		totals,
		expenseBreakdown: buildBreakdown(expenseSlices),
		incomeBreakdown: buildBreakdown(incomeSlices),
		days: fillDailySeries(series, range.from, addDays(range.to, -1), bangkokDayKey(now)),
		recent: recent.map(toTxView),
		uncategorised: uncategorisedCount(expenseSlices)
	};
};

export const actions: Actions = {
	/** Same parser the LINE bot uses, so both entry points behave identically. */
	add: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const text = String(form.get('text') ?? '').trim();
		if (!text) return fail(400, { action: 'add', ok: false, message: 'พิมพ์รายการก่อน' });

		// The same parser as the chat, so a list pasted into the box behaves the
		// way it does in LINE — one entry per line.
		const outcomes = await parseEntries(text, new Date(), { userId });
		const entries = outcomes.filter((outcome) => outcome.type === 'transaction');
		if (entries.length === 0) {
			return fail(422, {
				action: 'add',
				ok: false,
				message: 'ไม่เข้าใจข้อความนี้ — ลองแบบ "ข้าวเที่ยง 60"'
			});
		}

		const saved = [];
		for (const { tx } of entries) {
			saved.push(
				await insertTransaction({
					userId,
					kind: tx.kind,
					amount: tx.amount.toFixed(2),
					categoryId: tx.categoryId,
					note: tx.note,
					occurredAt: tx.occurredAt,
					paymentMethod: tx.paymentMethod,
					source: 'web',
					parsedBy: tx.parsedBy,
					rawText: entries.length > 1 && tx.note ? `${tx.note} ${tx.amount}` : text
				})
			);
		}

		const skipped = outcomes
			.filter((outcome) => outcome.type === 'unknown')
			.map((outcome) => outcome.text);
		return {
			action: 'add',
			ok: true,
			message:
				saved.length === 1 && skipped.length === 0
					? confirmSaved(saved[0], saved[0].categoryId === FALLBACK_CATEGORY[saved[0].kind])
					: confirmSavedMany(saved, skipped)
		};
	},

	delete: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id)) return fail(400, { action: 'delete', ok: false, message: 'id ไม่ถูกต้อง' });

		const removed = await deleteTransaction(id, userId);
		if (!removed) return fail(404, { action: 'delete', ok: false, message: 'ไม่พบรายการนี้' });
		return { action: 'delete', ok: true, message: 'ลบแล้ว' };
	}
};
