import { describe, expect, it } from 'vitest';
import { parseSlipText } from '../src/lib/server/ocr/slip';

describe('slip OCR text parsing', () => {
	it('extracts Thai amount, Buddhist date and recipient', () => {
		const result = parseSlipText('โอนเงินสำเร็จ\nวันที่ 05/09/2569 13:42\nไปยัง ร้านข้าวแกง\nจำนวนเงิน 1,250.50 บาท\nเลขที่รายการ ABC123');
		expect(result.amount).toBe(1250.5);
		expect(result.occurredAt?.toISOString()).toBe('2026-09-05T06:42:00.000Z');
		expect(result.recipient).toBe('ร้านข้าวแกง');
		expect(result.reference).toBe('ABC123');
	});

	it('does not mistake account and reference numbers for an amount', () => {
		const result = parseSlipText('บัญชี xxx-1-23456-x\nReference 999999999999\nAmount THB 89.00');
		expect(result.amount).toBe(89);
	});

	it('returns null when the total is unreadable', () => {
		expect(parseSlipText('โอนเงินสำเร็จ').amount).toBeNull();
	});

	it('rejects an impossible calendar date', () => {
		expect(parseSlipText('วันที่ 31/02/2569\nจำนวนเงิน 50.00 บาท').occurredAt).toBeNull();
	});
});
