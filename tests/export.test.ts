import { describe, expect, it } from 'vitest';
import {
	billsCsv,
	exportJson,
	exportMonthKeys,
	formatBangkokDateTime,
	moneyTotals,
	parseExportSelection,
	transactionsCsv,
	type PersonalExport
} from '../src/lib/export';

function fixture(): PersonalExport {
	return {
		schemaVersion: 1,
		generatedAt: '2026-09-07T09:30:00+07:00',
		timezone: 'Asia/Bangkok',
		selection: { from: '2026-08-31', to: '2026-09-02' },
		scope: {
			transactions: 'selected_range',
			billPayments: 'selected_range',
			monthlyPlans: 'overlapping_months',
			bills: 'all_saved'
		},
		account: { displayName: 'คุณทดสอบ', createdAt: '2026-01-01T00:00:00+07:00' },
		totals: { income: '1000.10', expense: '60.25', net: '939.85', transactionCount: 2, billCount: 1 },
		transactions: [
			{ id: 1, kind: 'income', amount: '1000.10', categoryId: 'salary', categoryNameTh: 'เงินเดือน', note: 'เงินเดือน', occurredAt: '2026-08-31T23:30:00+07:00', paymentMethod: 'bank', billId: null, source: 'web', parsedBy: 'manual', createdAt: '2026-08-31T23:31:00+07:00' },
			{ id: 2, kind: 'expense', amount: '60.25', categoryId: 'food', categoryNameTh: 'อาหาร', note: '=HYPERLINK("bad") กาแฟ,ขนม', occurredAt: '2026-09-01T08:15:00+07:00', paymentMethod: 'cash', billId: null, source: 'line', parsedBy: 'rule', createdAt: '2026-09-01T08:16:00+07:00' }
		],
		bills: [
			{ id: 9, name: 'ค่าไฟ', amount: '899.90', categoryId: 'bills', categoryNameTh: 'บิลและสาธารณูปโภค', paymentMethod: 'bank', recurrence: 'monthly', dueDay: 15, dueDate: null, active: true, createdAt: '2026-01-01T00:00:00+07:00', updatedAt: '2026-09-01T00:00:00+07:00' }
		],
		billPayments: [],
		monthlyPlans: []
	};
}

describe('personal data export', () => {
	it('resolves a Bangkok month and an inclusive cross-month date range', () => {
		const month = parseExportSelection(new URLSearchParams('mode=month&month=2026-02'));
		expect(month.from.toISOString()).toBe('2026-01-31T17:00:00.000Z');
		expect(month.to.toISOString()).toBe('2026-02-28T17:00:00.000Z');
		expect(month.toKey).toBe('2026-02-28');

		const range = parseExportSelection(new URLSearchParams('mode=range&from=2026-08-31&to=2026-09-02'));
		expect(exportMonthKeys(range)).toEqual(['2026-08', '2026-09']);
		expect(range.to.toISOString()).toBe('2026-09-02T17:00:00.000Z');
	});

	it('rejects invalid and reversed dates', () => {
		expect(() => parseExportSelection(new URLSearchParams('mode=range&from=2026-02-30&to=2026-03-01'))).toThrow('วันที่ไม่ถูกต้อง');
		expect(() => parseExportSelection(new URLSearchParams('mode=range&from=2026-09-02&to=2026-09-01'))).toThrow('วันที่สิ้นสุด');
	});

	it('formats instants in Bangkok and sums decimal money without float rounding', () => {
		expect(formatBangkokDateTime(new Date('2026-09-01T17:30:45Z'))).toBe('2026-09-02T00:30:45+07:00');
		expect(moneyTotals([
			{ kind: 'income', amount: '0.10' },
			{ kind: 'income', amount: '0.20' },
			{ kind: 'expense', amount: '0.03' }
		])).toEqual({ income: '0.30', expense: '0.03', net: '0.27' });
	});

	it('writes Thai CSV with a BOM, quotes fields and neutralises spreadsheet formulas', () => {
		const csv = transactionsCsv(fixture());
		expect(csv.startsWith('\uFEFF')).toBe(true);
		expect(csv).toContain('"อาหาร"');
		expect(csv).toContain('"\'=HYPERLINK(""bad"") กาแฟ,ขนม"');
		expect(csv).toContain('"60.25"');
	});

	it('still produces usable CSV headers when there is no data', () => {
		const data = fixture();
		data.transactions = [];
		data.bills = [];
		expect(transactionsCsv(data).split('\r\n')).toHaveLength(2);
		expect(billsCsv(data)).toContain('"due_date"');
	});

	it('keeps the documented JSON structure and exact decimal strings', () => {
		const parsed = JSON.parse(exportJson(fixture()));
		expect(parsed.timezone).toBe('Asia/Bangkok');
		expect(parsed.transactions[1].amount).toBe('60.25');
		expect(parsed.transactions[1].note).toBe('=HYPERLINK("bad") กาแฟ,ขนม');
		expect(parsed.scope.bills).toBe('all_saved');
		expect(parsed).not.toHaveProperty('lineUserId');
	});
});
