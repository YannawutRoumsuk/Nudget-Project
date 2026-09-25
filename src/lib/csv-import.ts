import { ALL_CATEGORIES } from '$lib/categories';
import type { PaymentMethod, TxKind } from '$lib/server/db/schema';
import { fromBangkok, bangkokDayKey } from '$lib/utils/date';

export const IMPORT_FIELDS = ['date', 'amount', 'kind', 'note', 'paymentMethod', 'category'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportMapping = Partial<Record<ImportField, number>>;
export interface ImportedTransaction {
	rowNumber: number;
	kind: TxKind;
	amount: string;
	categoryId: string;
	note: string;
	occurredAt: Date;
	day: string;
	paymentMethod: PaymentMethod;
}
export interface ImportRowResult {
	rowNumber: number;
	transaction: ImportedTransaction | null;
	error: string | null;
}

export function transactionImportKey(tx: Pick<ImportedTransaction, 'day' | 'kind' | 'amount' | 'categoryId' | 'note' | 'paymentMethod'>): string {
	return JSON.stringify([tx.day, tx.kind, Number(tx.amount).toFixed(2), tx.categoryId, tx.note, tx.paymentMethod]);
}

const MAX_BYTES = 256 * 1024;
const MAX_ROWS = 500;
const MAX_COLUMNS = 32;

/** RFC 4180-style CSV reader with quoted commas, escaped quotes, and newlines. */
export function parseCsv(text: string): string[][] {
	if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 256 KB');
	const input = text.replace(/^\uFEFF/u, '');
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let closedQuote = false;
	const pushField = () => {
		row.push(field);
		field = '';
		closedQuote = false;
		if (row.length > MAX_COLUMNS) throw new Error('ไฟล์มีคอลัมน์เกิน 32 คอลัมน์');
	};
	const pushRow = () => {
		pushField();
		if (row.some((cell) => cell.trim() !== '')) rows.push(row);
		row = [];
		if (rows.length > MAX_ROWS + 1) throw new Error('ไฟล์มีเกิน 500 รายการ');
	};

	for (let i = 0; i < input.length; i += 1) {
		const char = input[i];
		if (quoted) {
			if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
			else if (char === '"') { quoted = false; closedQuote = true; }
			else field += char;
			continue;
		}
		if (closedQuote && char !== ',' && char !== '\r' && char !== '\n' && char !== ' ' && char !== '\t') {
			throw new Error('CSV มีข้อความต่อท้ายเครื่องหมายคำพูดที่ไม่ถูกต้อง');
		}
		if (char === '"') {
			if (field.trim() !== '') throw new Error('เครื่องหมายคำพูดใน CSV ไม่ถูกต้อง');
			field = '';
			quoted = true;
		} else if (char === ',') pushField();
		else if (char === '\r' || char === '\n') {
			pushRow();
			if (char === '\r' && input[i + 1] === '\n') i += 1;
		} else if (!closedQuote) field += char;
	}
	if (quoted) throw new Error('CSV มีเครื่องหมายคำพูดเปิดไว้แต่ไม่ได้ปิด');
	if (field !== '' || row.length) pushRow();
	if (rows.length < 2) throw new Error('ไฟล์ต้องมีแถวหัวตารางและรายการอย่างน้อย 1 รายการ');
	const width = rows[0].length;
	if (rows.some((item) => item.length !== width)) throw new Error('จำนวนคอลัมน์ในแต่ละแถวไม่เท่ากัน');
	return rows;
}

export function suggestImportMapping(headers: string[]): ImportMapping {
	const aliases: Record<ImportField, string[]> = {
		date: ['date', 'วันที่', 'วันเวลา'], amount: ['amount', 'ยอดเงิน', 'จำนวนเงิน'], kind: ['kind', 'type', 'ประเภท'],
		note: ['note', 'description', 'รายละเอียด', 'บันทึก'], paymentMethod: ['payment_method', 'payment method', 'วิธีจ่าย'],
		category: ['category', 'หมวด', 'หมวดหมู่']
	};
	const normalized = headers.map((header) => header.trim().toLocaleLowerCase());
	const mapping: ImportMapping = {};
	for (const [field, names] of Object.entries(aliases) as [ImportField, string[]][]) {
		const index = normalized.findIndex((header) => names.includes(header));
		if (index >= 0) mapping[field] = index;
	}
	return mapping;
}

export function mapImportRows(rows: string[][], mapping: ImportMapping): ImportRowResult[] {
	const headers = rows[0];
	for (const field of ['date', 'amount', 'kind', 'category'] as const) {
		if (!Number.isInteger(mapping[field]) || mapping[field]! < 0 || mapping[field]! >= headers.length) throw new Error(`เลือกคอลัมน์ “${FIELD_LABELS[field]}” ให้ถูกต้อง`);
	}
	for (const field of IMPORT_FIELDS) {
		const index = mapping[field];
		if (index !== undefined && (!Number.isInteger(index) || index < 0 || index >= headers.length)) throw new Error(`คอลัมน์ “${FIELD_LABELS[field]}” ไม่ถูกต้อง`);
	}
	const get = (cells: string[], field: ImportField) => {
		const index = mapping[field];
		return index === undefined ? '' : (cells[index] ?? '').trim();
	};

	return rows.slice(1).map((cells, index) => {
		const rowNumber = index + 2;
		const fail = (message: string): ImportRowResult => ({ rowNumber, transaction: null, error: message });
		const date = parseImportDate(get(cells, 'date'));
		if (!date) return fail('วันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD หรือ DD/MM/YYYY');
		const amount = parseAmount(get(cells, 'amount'));
		if (!amount) return fail('ยอดเงินต้องมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง');
		const kind = parseKind(get(cells, 'kind'));
		if (!kind) return fail('ประเภทใช้ expense/รายจ่าย หรือ income/รายรับ');
		const categoryId = resolveCategory(get(cells, 'category'), kind);
		if (!categoryId) return fail('หมวดไม่ตรงกับประเภท หรือไม่รู้จักหมวดนี้');
		const paymentMethod = parsePaymentMethod(get(cells, 'paymentMethod'));
		if (!paymentMethod) return fail('วิธีจ่ายไม่ถูกต้อง');
		const note = get(cells, 'note');
		if (note.length > 500) return fail('รายละเอียดต้องไม่เกิน 500 ตัวอักษร');
		return { rowNumber, error: null, transaction: { rowNumber, kind, amount, categoryId, note, occurredAt: date, day: bangkokDayKey(date), paymentMethod } };
	});
}

function parseImportDate(raw: string): Date | null {
	let year = 0, month = 0, day = 0;
	let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(raw);
	if (match) [, year, month, day] = match.map(Number);
	else {
		match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/u.exec(raw);
		if (!match) return null;
		[, day, month, year] = match.map(Number);
		if (year < 100) year += year >= 50 ? 1900 : 2000;
	}
	if (year >= 2400 && year <= 2700) year -= 543;
	if (year < 1900 || year > 2200) return null;
	const value = fromBangkok(year, month, day, 12);
	return bangkokDayKey(value) === `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` ? value : null;
}

function parseAmount(raw: string): string | null {
	const value = raw.replace(/฿|บาท|\s/gu, '');
	if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/u.test(value)) return null;
	const amount = Number(value.replace(/,/gu, ''));
	return Number.isFinite(amount) && amount > 0 && amount < 10_000_000_000 ? amount.toFixed(2) : null;
}

function parseKind(raw: string): TxKind | null {
	const value = raw.trim().toLocaleLowerCase();
	return ['expense', 'รายจ่าย', 'จ่ายออก'].includes(value) ? 'expense'
		: ['income', 'รายรับ', 'รับเข้า'].includes(value) ? 'income' : null;
}

function resolveCategory(raw: string, kind: TxKind): string | null {
	const value = raw.trim().toLocaleLowerCase();
	const category = ALL_CATEGORIES.find((item) => item.kind === kind && [item.id, item.nameTh, item.nameEn].some((name) => name.toLocaleLowerCase() === value));
	return category?.id ?? null;
}

function parsePaymentMethod(raw: string): PaymentMethod | null {
	const value = raw.trim().toLocaleLowerCase();
	if (!value) return 'bank';
	const options: Record<string, PaymentMethod> = {
		bank: 'bank', transfer: 'bank', 'โอน/บัญชี': 'bank', โอน: 'bank', cash: 'cash', เงินสด: 'cash',
		credit_card: 'credit_card', 'credit card': 'credit_card', 'บัตรเครดิต': 'credit_card',
		shopee_paylater: 'shopee_paylater', 'shopee paylater': 'shopee_paylater', 'shopee later': 'shopee_paylater',
		wallet: 'wallet', ewallet: 'wallet', วอลเล็ต: 'wallet'
	};
	return options[value] ?? null;
}

const FIELD_LABELS: Record<ImportField, string> = {
	date: 'วันที่', amount: 'ยอดเงิน', kind: 'ประเภท', note: 'รายละเอียด', paymentMethod: 'วิธีจ่าย', category: 'หมวดหมู่'
};
