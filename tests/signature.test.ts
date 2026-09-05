import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyLineSignature } from '../src/lib/server/line/signature';

const SECRET = 'test-channel-secret';
const BODY = JSON.stringify({ events: [{ type: 'message' }] });

function sign(body: string, secret = SECRET): string {
	return createHmac('sha256', secret).update(body, 'utf8').digest('base64');
}

describe('verifyLineSignature', () => {
	it('accepts a signature produced with the channel secret', () => {
		expect(verifyLineSignature(BODY, sign(BODY), SECRET)).toBe(true);
	});

	it('rejects a body that was altered after signing', () => {
		expect(verifyLineSignature(`${BODY} `, sign(BODY), SECRET)).toBe(false);
	});

	it('rejects a signature made with a different secret', () => {
		expect(verifyLineSignature(BODY, sign(BODY, 'other-secret'), SECRET)).toBe(false);
	});

	it('rejects a missing signature header', () => {
		expect(verifyLineSignature(BODY, null, SECRET)).toBe(false);
	});

	it('rejects when the channel secret is not configured', () => {
		expect(verifyLineSignature(BODY, sign(BODY), '')).toBe(false);
	});

	it('rejects garbage that is not valid base64 of the right length', () => {
		expect(verifyLineSignature(BODY, 'not-a-signature', SECRET)).toBe(false);
	});

	it('handles a UTF-8 body byte-for-byte', () => {
		const thai = JSON.stringify({ text: 'ข้าวเที่ยง 60' });
		expect(verifyLineSignature(thai, sign(thai), SECRET)).toBe(true);
	});
});
