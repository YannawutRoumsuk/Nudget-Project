import { error } from '@sveltejs/kit';
import { billsCsv, exportJson, parseExportSelection, transactionsCsv } from '$lib/export';
import { requireUserId } from '$lib/server/auth';
import { getPersonalExport } from '$lib/server/db/exports';
import type { RequestHandler } from './$types';

const FORMATS = ['transactions.csv', 'bills.csv', 'json'] as const;
type Format = typeof FORMATS[number];

export const GET: RequestHandler = async ({ url, locals }) => {
	const userId = requireUserId(locals);
	const format = url.searchParams.get('format') as Format | null;
	if (!format || !FORMATS.includes(format)) error(400, 'รูปแบบไฟล์ไม่ถูกต้อง');

	let selection;
	try {
		selection = parseExportSelection(url.searchParams);
	} catch (reason) {
		error(400, reason instanceof Error ? reason.message : 'ช่วงวันที่ไม่ถูกต้อง');
	}

	const data = await getPersonalExport(userId, selection);
	const span = `${selection.fromKey}-to-${selection.toKey}`;
	const headers = {
		'Cache-Control': 'private, no-store, max-age=0',
		'Content-Disposition': `attachment; filename="nudget-${format.replace('.', '-')}-${span}.${format === 'json' ? 'json' : 'csv'}"`,
		'X-Content-Type-Options': 'nosniff'
	};

	if (format === 'transactions.csv') {
		return new Response(transactionsCsv(data), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' } });
	}
	if (format === 'bills.csv') {
		return new Response(billsCsv(data), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' } });
	}
	return new Response(exportJson(data), { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
};
