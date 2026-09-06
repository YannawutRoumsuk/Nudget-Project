import { parseExportSelection, selectionQuery } from '$lib/export';
import { requireUserId } from '$lib/server/auth';
import { getPersonalExport } from '$lib/server/db/exports';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const userId = requireUserId(locals);
	let message = '';
	let selection;
	try {
		selection = parseExportSelection(url.searchParams);
	} catch (error) {
		message = error instanceof Error ? error.message : 'ช่วงวันที่ไม่ถูกต้อง';
		selection = parseExportSelection(new URLSearchParams());
	}

	const data = await getPersonalExport(userId, selection);
	return {
		message,
		selection: {
			mode: selection.mode,
			month: selection.month,
			from: selection.fromKey,
			to: selection.toKey,
			query: selectionQuery(selection)
		},
		summary: data.totals,
		paymentCount: data.billPayments.length,
		planCount: data.monthlyPlans.length
	};
};
