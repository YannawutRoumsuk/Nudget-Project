import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * LINE signs every webhook body with the channel secret. Verifying it is the
 * only thing stopping anyone who knows the URL from writing to the ledger, so
 * the raw body — not a re-serialised object — must be what gets hashed.
 */
export function verifyLineSignature(
	rawBody: string,
	signature: string | null,
	channelSecret: string
): boolean {
	if (!signature || !channelSecret) return false;

	const expected = createHmac('sha256', channelSecret).update(rawBody, 'utf8').digest();

	let received: Buffer;
	try {
		received = Buffer.from(signature, 'base64');
	} catch {
		return false;
	}

	if (received.length !== expected.length) return false;
	return timingSafeEqual(received, expected);
}
