import { fail } from '@sveltejs/kit';
import { ALL_CATEGORIES } from '$lib/categories';
import { DEFAULT_RANGE, resolveRange } from '$lib/ranges';
import { resolveMonthSelection } from '$lib/month';
import { deleteTransaction, getTotals, listTransactions } from '$lib/server/db/queries';
import { requireUserId } from '$lib/server/auth';
import { toTxView } from '$lib/server/views';
import { addDays, bangkokDayKey, fromBangkok, formatThaiShortDate } from '$lib/utils/date';
import type { TxKind } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const LIMIT = 300;

function parseKind(value: string | null): TxKind | undefined {
	return value === 'income' || value === 'expense' ? value : undefined;
}

function parseCategory(value: string | null): string | undefined {
	return ALL_CATEGORIES.some((category) => category.id === value) ? (value as string) : undefined;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const userId = requireUserId(locals);
	const now = new Date();
	const month = resolveMonthSelection(url.searchParams.get('month'), now);
	const rangeId = url.searchParams.get('range') ?? DEFAULT_RANGE;
	const relativeRange = resolveRange(rangeId, now);
	const dayKey = url.searchParams.get('day') ?? '';
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
	const dayParts = match?.slice(1).map(Number);
	const dayStart = dayParts && dayKey.slice(0, 7) === month.key ? fromBangkok(dayParts[0], dayParts[1], dayParts[2]) : null;
	const range = dayStart && bangkokDayKey(dayStart) === dayKey
		? { id: 'day', label: formatThaiShortDate(dayStart), from: dayStart, to: addDays(dayStart, 1), elapsedDays: 1 }
		: relativeRange.id === 'month' ? month : relativeRange;
	const kind = parseKind(url.searchParams.get('kind'));
	const categoryId = parseCategory(url.searchParams.get('category'));

	const [items, totals] = await Promise.all([
		listTransactions(userId, range, { limit: LIMIT, kind, categoryId }),
		getTotals(userId, range)
	]);

	return {
		range: { id: range.id, label: range.label },
		month,
		filters: { kind: kind ?? null, categoryId: categoryId ?? null },
		items: items.map(toTxView),
		totals,
		truncated: items.length === LIMIT
	};
};

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id)) return fail(400, { message: 'id ไม่ถูกต้อง' });

		const removed = await deleteTransaction(id, userId);
		if (!removed) return fail(404, { message: 'ไม่พบรายการนี้' });
		return { message: 'ลบแล้ว' };
	}
};
