import { describe, expect, it } from 'vitest';
import { slipFingerprint, textTransactionFingerprint } from '../src/lib/server/dedupe';

describe('dedupe fingerprints', () => {
	const tx = { kind: 'expense', amount: 120, categoryId: 'food', note: 'กาแฟ', paymentMethod: 'bank' };
	it('normalizes parsed details and case', () => {
		const time = new Date('2026-09-12T00:00:00Z');
		expect(textTransactionFingerprint({ ...tx, note: '  ABC   ๑๒๐ ' }, time)).toBe(
			textTransactionFingerprint({ ...tx, note: 'abc 120', amount: '120.00' }, new Date(time.getTime() + 5_000))
		);
	});
	it('changes when the time bucket changes', () => {
		const time = new Date('2026-09-12T00:00:00Z');
		expect(textTransactionFingerprint(tx, time)).not.toBe(textTransactionFingerprint(tx, new Date(time.getTime() + 5 * 60_000)));
	});
	it('keeps identical lines distinct inside one batch while matching a repeated batch', () => {
		const time = new Date('2026-09-12T00:00:00Z');
		expect(textTransactionFingerprint(tx, time, 0)).not.toBe(textTransactionFingerprint(tx, time, 1));
		expect(textTransactionFingerprint(tx, time, 1)).toBe(textTransactionFingerprint({ ...tx }, time, 1));
	});
	it('matches slips by details and separates their time', () => {
		const a = { amount: 120, recipient: 'ร้าน A', reference: 'REF1', occurredAt: '2026-09-12T03:00:00Z' };
		expect(slipFingerprint(a, new Uint8Array([1]))).toBe(slipFingerprint({ ...a, recipient: '  ร้าน   A ' }, new Uint8Array([2])));
		expect(slipFingerprint(a, new Uint8Array([1]))).not.toBe(slipFingerprint({ ...a, occurredAt: '2026-09-13T03:00:00Z' }, new Uint8Array([1])));
	});
	it('falls back to image bytes for weak OCR', () => {
		const weak = { amount: null, occurredAt: null, recipient: '', reference: '' };
		expect(slipFingerprint(weak, new Uint8Array([1, 2]))).toBe(slipFingerprint(weak, new Uint8Array([1, 2])));
		expect(slipFingerprint(weak, new Uint8Array([1, 2]))).not.toBe(slipFingerprint(weak, new Uint8Array([1, 3])));
	});
	it('uses image bytes when only an amount was readable', () => {
		const partial = { amount: 120, occurredAt: null, recipient: '', reference: '' };
		expect(slipFingerprint(partial, new Uint8Array([1, 2]))).not.toBe(slipFingerprint(partial, new Uint8Array([1, 3])));
	});
});
