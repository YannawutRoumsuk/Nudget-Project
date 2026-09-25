import { describe, expect, it } from 'vitest';
import { mapImportRows, parseCsv, suggestImportMapping, transactionImportKey } from '../src/lib/csv-import';

describe('CSV transaction import', () => {
	it('reads BOM, CRLF, quoted commas, escaped quotes, and multiline notes', () => {
		const rows = parseCsv('\uFEFFdate,amount,kind,note,payment_method,category\r\n2026-09-25,120,expense,"ร้าน A, สาขา 2: ""ดี""\nจ่ายแล้ว",cash,food\r\n');
		expect(rows).toEqual([
			['date', 'amount', 'kind', 'note', 'payment_method', 'category'],
			['2026-09-25', '120', 'expense', 'ร้าน A, สาขา 2: "ดี"\nจ่ายแล้ว', 'cash', 'food']
		]);
	});

	it('suggests common header mappings and accepts Buddhist dates and Thai labels', () => {
		const rows = parseCsv('วันที่,จำนวนเงิน,ประเภท,บันทึก,วิธีจ่าย,หมวดหมู่\n25/09/2569,"1,234.50",รายจ่าย,ค่าเดินทาง,โอน,เดินทาง');
		const mapping = suggestImportMapping(rows[0]);
		const [result] = mapImportRows(rows, mapping);
		expect(result.error).toBeNull();
		expect(result.transaction).toMatchObject({ day: '2026-09-25', amount: '1234.50', kind: 'expense', categoryId: 'transport', paymentMethod: 'bank', note: 'ค่าเดินทาง' });
	});

	it('reports bad rows before any data can be imported', () => {
		const rows = parseCsv('date,amount,kind,note,payment_method,category\n2026-02-30,-20,expense,test,cash,food\n2026-09-25,30,income,test,cash,food');
		const mapping = suggestImportMapping(rows[0]);
		expect(mapImportRows(rows, mapping).map((row) => row.error)).toEqual([
			'วันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD หรือ DD/MM/YYYY',
			'หมวดไม่ตรงกับประเภท หรือไม่รู้จักหมวดนี้'
		]);
	});

	it('rejects malformed CSV, inconsistent rows, and overlarge files', () => {
		expect(() => parseCsv('a,b\n"broken,2')).toThrow('ไม่ได้ปิด');
		expect(() => parseCsv('a,b\n1')).toThrow('จำนวนคอลัมน์');
		expect(() => parseCsv(`a,b\n${'x'.repeat(256 * 1024)},1`)).toThrow('256 KB');
	});

	it('builds a stable deduplication key from date and imported transaction fields', () => {
		const rows = parseCsv('date,amount,kind,note,payment_method,category\n2026-09-25,120,expense,Grab,bank,transport');
		const [entry] = mapImportRows(rows, suggestImportMapping(rows[0]));
		expect(transactionImportKey(entry.transaction!)).toBe(transactionImportKey(entry.transaction!));
	});
});
