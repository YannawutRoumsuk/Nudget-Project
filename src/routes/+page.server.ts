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
import { confirmSaved } from '$lib/server/line/messages';
import { parseMessage } from '$lib/server/parser';
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

		const outcome = await parseMessage(text);
		if (outcome.type !== 'transaction') {
			return fail(422, {
				action: 'add',
				ok: false,
				message: 'ไม่เข้าใจข้อความนี้ — ลองแบบ "ข้าวเที่ยง 60"'
			});
		}

		const { tx } = outcome;
		const saved = await insertTransaction({
			userId,
			kind: tx.kind,
			amount: tx.amount.toFixed(2),
			categoryId: tx.categoryId,
			note: tx.note,
			occurredAt: tx.occurredAt,
			paymentMethod: tx.paymentMethod,
			source: 'web',
			parsedBy: tx.parsedBy,
			rawText: text
		});

		return {
			action: 'add',
			ok: true,
			message: confirmSaved(saved, saved.categoryId === FALLBACK_CATEGORY[saved.kind])
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
