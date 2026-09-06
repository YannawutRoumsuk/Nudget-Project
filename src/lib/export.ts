import { addDays, bangkokDayKey, bangkokMonthKey, bangkokMonthStart, bangkokParts, fromBangkok } from '$lib/utils/date';

export const EXPORT_TIMEZONE = 'Asia/Bangkok';
const MAX_EXPORT_DAYS = 3660;

export interface ExportSelection {
	mode: 'month' | 'range';
	month: string;
	from: Date;
	to: Date;
	fromKey: string;
	toKey: string;
}

export interface ExportTransaction {
	id: number;
	kind: string;
	amount: string;
	categoryId: string;
	categoryNameTh: string;
	note: string;
	occurredAt: string;
	paymentMethod: string;
	billId: number | null;
	source: string;
	parsedBy: string;
	createdAt: string;
}

export interface ExportBill {
	id: number;
	name: string;
	amount: string;
	categoryId: string;
	categoryNameTh: string;
	paymentMethod: string;
	recurrence: string;
	dueDay: number | null;
	dueDate: string | null;
	active: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface ExportBillPayment {
	id: number;
	billId: number;
	period: string;
	transactionId: number | null;
	paidAt: string;
}

export interface ExportMonthlyPlan {
	month: string;
	expectedIncome: string;
	savingsGoal: string;
	foodDailyBudget: string;
	commuteDailyBudget: string;
	commuteDays: number;
	updatedAt: string;
}

export interface PersonalExport {
	schemaVersion: 1;
	generatedAt: string;
	timezone: typeof EXPORT_TIMEZONE;
	selection: { from: string; to: string };
	scope: {
		transactions: 'selected_range';
		billPayments: 'selected_range';
		monthlyPlans: 'overlapping_months';
		bills: 'all_saved';
	};
	account: { displayName: string; createdAt: string } | null;
	totals: { income: string; expense: string; net: string; transactionCount: number; billCount: number };
	transactions: ExportTransaction[];
	bills: ExportBill[];
	billPayments: ExportBillPayment[];
	monthlyPlans: ExportMonthlyPlan[];
}

export function parseExportSelection(params: URLSearchParams, now = new Date()): ExportSelection {
	const mode = params.get('mode') === 'range' ? 'range' : 'month';
	if (mode === 'month') {
		const month = params.get('month') || bangkokMonthKey(now);
		const parts = parseMonth(month);
		const from = fromBangkok(parts.year, parts.month, 1);
		const to = fromBangkok(parts.year, parts.month + 1, 1);
		return {
			mode,
			month,
			from,
			to,
			fromKey: bangkokDayKey(from),
			toKey: bangkokDayKey(addDays(to, -1))
		};
	}

	const fromKey = params.get('from') || '';
	const toKey = params.get('to') || '';
	const from = parseDay(fromKey);
	const lastDay = parseDay(toKey);
	const to = addDays(lastDay, 1);
	const days = (to.getTime() - from.getTime()) / 86_400_000;
	if (days < 1) throw new Error('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
	if (days > MAX_EXPORT_DAYS) throw new Error('เลือกช่วงได้ไม่เกิน 10 ปีต่อครั้ง');
	return { mode, month: bangkokMonthKey(from), from, to, fromKey, toKey };
}

export function selectionQuery(selection: ExportSelection): string {
	const params = new URLSearchParams();
	params.set('mode', selection.mode);
	if (selection.mode === 'month') params.set('month', selection.month);
	else {
		params.set('from', selection.fromKey);
		params.set('to', selection.toKey);
	}
	return params.toString();
}

export function exportMonthKeys(selection: Pick<ExportSelection, 'from' | 'to'>): string[] {
	const keys: string[] = [];
	let cursor = bangkokMonthStart(selection.from);
	while (cursor < selection.to) {
		keys.push(bangkokMonthKey(cursor));
		const { year, month } = bangkokParts(cursor);
		cursor = fromBangkok(year, month + 1, 1);
	}
	return keys;
}

export function formatBangkokDateTime(instant: Date): string {
	const shifted = new Date(instant.getTime() + 7 * 60 * 60 * 1000);
	return `${shifted.toISOString().slice(0, 19)}+07:00`;
}

export function moneyTotals(transactions: Pick<ExportTransaction, 'kind' | 'amount'>[]) {
	let income = 0n;
	let expense = 0n;
	for (const transaction of transactions) {
		const cents = moneyToCents(transaction.amount);
		if (transaction.kind === 'income') income += cents;
		else expense += cents;
	}
	return { income: centsToMoney(income), expense: centsToMoney(expense), net: centsToMoney(income - expense) };
}

export function transactionsCsv(data: PersonalExport): string {
	const headers = ['id', 'type', 'amount', 'category_id', 'category_th', 'note', 'occurred_at_bangkok', 'payment_method', 'bill_id', 'source', 'parsed_by', 'created_at_bangkok'];
	const rows = data.transactions.map((row) => [
		row.id, row.kind, row.amount, row.categoryId, row.categoryNameTh, row.note, row.occurredAt,
		row.paymentMethod, row.billId ?? '', row.source, row.parsedBy, row.createdAt
	]);
	return csv(headers, rows);
}

export function billsCsv(data: PersonalExport): string {
	const headers = ['id', 'name', 'amount', 'category_id', 'category_th', 'payment_method', 'recurrence', 'due_day', 'due_date', 'active', 'created_at_bangkok', 'updated_at_bangkok'];
	const rows = data.bills.map((row) => [
		row.id, row.name, row.amount, row.categoryId, row.categoryNameTh, row.paymentMethod,
		row.recurrence, row.dueDay ?? '', row.dueDate ?? '', row.active, row.createdAt, row.updatedAt
	]);
	return csv(headers, rows);
}

export function exportJson(data: PersonalExport): string {
	return `${JSON.stringify(data, null, 2)}\n`;
}

function csv(headers: string[], rows: (string | number | boolean)[][]): string {
	return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function csvCell(input: string | number | boolean): string {
	let value = String(input);
	// Spreadsheet programs interpret these prefixes as formulas. An apostrophe
	// keeps user-entered notes and bill names as text without changing JSON.
	if (/^[\t\r\n ]*[=+\-@]/.test(value)) value = `'${value}`;
	return `"${value.replaceAll('"', '""')}"`;
}

function parseMonth(value: string): { year: number; month: number } {
	const match = /^(\d{4})-(\d{2})$/.exec(value);
	if (!match) throw new Error('เดือนต้องอยู่ในรูป YYYY-MM');
	const year = Number(match[1]);
	const month = Number(match[2]);
	if (year < 2000 || year > 2200 || month < 1 || month > 12) throw new Error('เดือนไม่ถูกต้อง');
	return { year, month };
}

function parseDay(value: string): Date {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) throw new Error('วันที่ต้องอยู่ในรูป YYYY-MM-DD');
	const instant = fromBangkok(Number(match[1]), Number(match[2]), Number(match[3]));
	if (bangkokDayKey(instant) !== value) throw new Error('วันที่ไม่ถูกต้อง');
	return instant;
}

function moneyToCents(value: string): bigint {
	const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
	if (!match) throw new Error(`invalid money value: ${value}`);
	const cents = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
	return match[1] ? -cents : cents;
}

function centsToMoney(cents: bigint): string {
	const sign = cents < 0 ? '-' : '';
	const absolute = cents < 0 ? -cents : cents;
	return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
