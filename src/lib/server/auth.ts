import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config';

export const SESSION_COOKIE = 'spendbot_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sign(payload: string): string {
	return createHmac('sha256', config.dashboard.sessionSecret).update(payload).digest('base64url');
}

/** Token is `<expiresAtMs>.<hmac>` — stateless, so there is no session table. */
export function createSessionToken(lineUserId = '', now = Date.now()): string {
	const expiresAt = now + MAX_AGE_SECONDS * 1000;
	const payload = `${lineUserId}.${expiresAt}`;
	return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): string | null {
	if (!token || !config.dashboard.sessionSecret) return null;

	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [lineUserId, expiresRaw, signature] = parts;
	if (!lineUserId) return null;

	const expiresAt = Number(expiresRaw);
	if (!Number.isFinite(expiresAt) || expiresAt < now) return null;

	return safeEqual(signature, sign(`${lineUserId}.${expiresRaw}`)) ? lineUserId : null;
}

export function checkPassword(input: string): boolean {
	const expected = config.dashboard.password;
	if (!expected) return false;
	return safeEqual(input, expected);
}

function safeEqual(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	if (left.length !== right.length) return false;
	return timingSafeEqual(left, right);
}

export const sessionCookieOptions = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax',
	maxAge: MAX_AGE_SECONDS
} as const;
