import { fail } from '@sveltejs/kit';
import { ALL_CATEGORIES } from '$lib/categories';
import { DEFAULT_RANGE, resolveRange } from '$lib/ranges';
import { resolveMonthSelection } from '$lib/month';
import { deleteTransaction, getFinanceQueryAggregate, listTransactions } from '$lib/server/db/queries';
import { requireUserId } from '$lib/server/auth';
import { toTxView } from '$lib/server/views';
import { addDays, bangkokDayKey, fromBangkok, formatThaiShortDate } from '$lib/utils/date';
import type { PaymentMethod, TxKind } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const LIMIT = 300;

function parseKind(value: string | null): TxKind | undefined {
	return value === 'income' || value === 'expense' ? value : undefined;
}

function parseCategory(value: string | null): string | undefined {
	return ALL_CATEGORIES.some((category) => category.id === value) ? (value as string) : undefined;
}

function parsePaymentMethod(value: string | null): PaymentMethod | undefined {
	return value && ['bank', 'cash', 'credit_card', 'shopee_paylater', 'wallet'].includes(value) ? value as PaymentMethod : undefined;
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
	const customRange = parseDateRange(url.searchParams.get('from'), url.searchParams.get('to'));
	const range = dayStart && bangkokDayKey(dayStart) === dayKey
		? { id: 'day', label: formatThaiShortDate(dayStart), from: dayStart, to: addDays(dayStart, 1), elapsedDays: 1 }
		: customRange
			? customRange
		: relativeRange.id === 'month' ? month : relativeRange;
	const kind = parseKind(url.searchParams.get('kind'));
	const categoryId = parseCategory(url.searchParams.get('category'));
	const paymentMethod = parsePaymentMethod(url.searchParams.get('payment'));

	const [items, aggregate] = await Promise.all([
		listTransactions(userId, range, { limit: LIMIT, kind, categoryId, paymentMethod }),
		getFinanceQueryAggregate(userId, {
			from: range.from, to: range.to, kind: kind ?? 'both', categoryIds: categoryId ? [categoryId] : [],
			paymentMethod: paymentMethod ?? null, groupBy: 'none'
		})
	]);

	return {
		range: { id: range.id, label: range.label },
		month,
		filters: { kind: kind ?? null, categoryId: categoryId ?? null, paymentMethod: paymentMethod ?? null },
		items: items.map(toTxView),
		totals: aggregate.totals,
		truncated: items.length === LIMIT
	};
};

function parseDateRange(fromRaw: string | null, toRaw: string | null) {
	if (!fromRaw || !toRaw || !/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(toRaw) || fromRaw > toRaw) return null;
	const fromParts = fromRaw.split('-').map(Number);
	const toParts = toRaw.split('-').map(Number);
	const from = fromBangkok(fromParts[0], fromParts[1], fromParts[2]);
	const toDay = fromBangkok(toParts[0], toParts[1], toParts[2]);
	if (bangkokDayKey(from) !== fromRaw || bangkokDayKey(toDay) !== toRaw || toDay.getTime() - from.getTime() > 365 * 86_400_000) return null;
	return { id: 'custom', label: `${formatThaiShortDate(from)}–${formatThaiShortDate(toDay)}`, from, to: addDays(toDay, 1), elapsedDays: Math.floor((toDay.getTime() - from.getTime()) / 86_400_000) + 1 };
}

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
