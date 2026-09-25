import { fail, redirect } from '@sveltejs/kit';
import { ALL_CATEGORIES } from '$lib/categories';
import { IMPORT_FIELDS, mapImportRows, parseCsv, suggestImportMapping, transactionImportKey } from '$lib/csv-import';
import type { ImportField, ImportMapping, ImportRowResult } from '$lib/csv-import';
import { requireUserId } from '$lib/server/auth';
import { previewImportDuplicates, saveImportedTransactions } from '$lib/server/db/import';
import type { Actions, PageServerLoad } from './$types';

const FIELD_LABELS: Record<ImportField, string> = {
	date: 'วันที่', amount: 'ยอดเงิน', kind: 'ประเภท', note: 'รายละเอียด', paymentMethod: 'วิธีจ่าย', category: 'หมวดหมู่'
};

export const load: PageServerLoad = async ({ locals }) => {
	requireUserId(locals);
	return { categories: ALL_CATEGORIES };
};

function parseMapping(form: FormData): ImportMapping {
	const mapping: ImportMapping = {};
	for (const field of IMPORT_FIELDS) {
		const raw = form.get(`mapping_${field}`);
		if (raw === null || raw === '') continue;
		const index = Number(raw);
		if (!Number.isInteger(index)) throw new Error(`คอลัมน์ “${FIELD_LABELS[field]}” ไม่ถูกต้อง`);
		mapping[field] = index;
	}
	return mapping;
}

function getCsvText(form: FormData): string {
	const value = form.get('csvText');
	if (typeof value !== 'string' || !value) throw new Error('กรุณาเลือกไฟล์ CSV ใหม่');
	return value;
}

function getFileName(form: FormData): string {
	const value = form.get('fileName');
	return typeof value === 'string' ? value.slice(0, 120) : 'transactions.csv';
}

function makePreview(results: ImportRowResult[], duplicateKeys: Set<string>) {
	const seen = new Set<string>();
	return results.map((row) => {
		if (!row.transaction) return { ...row, duplicate: false };
		const key = transactionImportKey(row.transaction);
		const duplicate = duplicateKeys.has(key) || seen.has(key);
		seen.add(key);
		return { ...row, duplicate };
	});
}

async function readAndValidate(form: FormData, userId: number) {
	const csvText = getCsvText(form);
	const mapping = parseMapping(form);
	const rows = parseCsv(csvText);
	const results = mapImportRows(rows, mapping);
	const entries = results.flatMap((row) => row.transaction ? [row.transaction] : []);
	const duplicateKeys = await previewImportDuplicates(userId, entries);
	return { csvText, fileName: getFileName(form), mapping, headers: rows[0], rows: makePreview(results, duplicateKeys) };
}

export const actions: Actions = {
	upload: async ({ request, locals }) => {
		requireUserId(locals);
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) return fail(400, { stage: 'error', message: 'เลือกไฟล์ CSV ก่อน' });
		if (file.size > 256 * 1024) return fail(400, { stage: 'error', message: 'ไฟล์ต้องมีขนาดไม่เกิน 256 KB' });
		if (!file.name.toLocaleLowerCase().endsWith('.csv')) return fail(400, { stage: 'error', message: 'เลือกไฟล์นามสกุล .csv' });
		try {
			let csvText: string;
			try { csvText = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
			catch { return fail(400, { stage: 'error', message: 'ไฟล์ต้องเข้ารหัส UTF-8 กรุณาบันทึกเป็น CSV UTF-8 แล้วลองใหม่' }); }
			const rows = parseCsv(csvText);
			return { stage: 'mapping', csvText, fileName: file.name, headers: rows[0], mapping: suggestImportMapping(rows[0]) };
		} catch (error) {
			return fail(400, { stage: 'error', message: error instanceof Error ? error.message : 'อ่านไฟล์ CSV ไม่ได้' });
		}
	},
	preview: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		try {
			return { stage: 'preview', ...(await readAndValidate(await request.formData(), userId)) };
		} catch (error) {
			return fail(400, { stage: 'error', message: error instanceof Error ? error.message : 'ตรวจไฟล์ CSV ไม่ได้' });
		}
	},
	import: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		let inserted = 0;
		let skippedDuplicates = 0;
		try {
			const form = await request.formData();
			const preview = await readAndValidate(form, userId);
			const invalidRows = preview.rows.filter((row) => !row.transaction);
			if (invalidRows.length) return fail(422, { stage: 'preview', ...preview, message: `ยังนำเข้าไม่ได้: มี ${invalidRows.length} แถวที่ข้อมูลไม่ถูกต้อง กรุณาแก้ CSV แล้วอัปโหลดใหม่` });
			const includeDuplicates = form.get('includeDuplicates') === 'on';
			const entries = preview.rows.flatMap((row) => row.transaction ? [row.transaction] : []);
			({ inserted, skippedDuplicates } = await saveImportedTransactions(userId, entries, includeDuplicates));
		} catch (error) {
			return fail(400, { stage: 'error', message: error instanceof Error ? error.message : 'นำเข้ารายการไม่สำเร็จ ไม่มีข้อมูลถูกบันทึก' });
		}
		redirect(303, `/import?inserted=${inserted}&duplicates=${skippedDuplicates}`);
	}
};
