import { fail } from '@sveltejs/kit';
import { ALL_CATEGORIES } from '$lib/categories';
import { DEFAULT_RANGE, resolveRange } from '$lib/ranges';
import { deleteTransaction, getTotals, listTransactions } from '$lib/server/db/queries';
import { requireUserId } from '$lib/server/auth';
import { toTxView } from '$lib/server/views';
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
	const range = resolveRange(url.searchParams.get('range') ?? DEFAULT_RANGE);
	const kind = parseKind(url.searchParams.get('kind'));
	const categoryId = parseCategory(url.searchParams.get('category'));

	const [items, totals] = await Promise.all([
		listTransactions(userId, range, { limit: LIMIT, kind, categoryId }),
		getTotals(userId, range)
	]);

	return {
		range: { id: range.id, label: range.label },
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
