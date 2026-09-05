import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config';

export const SESSION_COOKIE = 'spendbot_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sign(payload: string): string {
	return createHmac('sha256', config.dashboard.sessionSecret).update(payload).digest('base64url');
}

/** Token is `<expiresAtMs>.<hmac>` — stateless, so there is no session table. */
export function createSessionToken(now = Date.now()): string {
	const expiresAt = now + MAX_AGE_SECONDS * 1000;
	return `${expiresAt}.${sign(String(expiresAt))}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
	if (!token || !config.dashboard.sessionSecret) return false;

	const separator = token.lastIndexOf('.');
	if (separator <= 0) return false;

	const expiresAt = Number(token.slice(0, separator));
	if (!Number.isFinite(expiresAt) || expiresAt < now) return false;

	return safeEqual(token.slice(separator + 1), sign(String(expiresAt)));
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
