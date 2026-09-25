import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { config } from './config';

/**
 * The single accessor every page and action uses to learn whose ledger it is
 * reading. Routes must never take an owner from a query string or form field.
 */
export function requireUserId(locals: App.Locals): number {
	if (!locals.userId) error(401, 'ต้องเข้าสู่ระบบก่อน');
	return locals.userId;
}

export const SESSION_COOKIE = 'spendbot_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const RECENT_LINE_SESSION_MS = 5 * 60 * 1000;
export const DELETE_CONFIRMATION_SECONDS = 10 * 60;
export const DELETE_CONFIRMATION_COOKIE = 'nudget_delete_confirmation';

export interface SessionClaims {
	lineUserId: string;
	issuedAt: number;
	expiresAt: number;
	method: 'line' | 'password';
}

function sign(payload: string): string {
	return createHmac('sha256', config.dashboard.sessionSecret).update(payload).digest('base64url');
}

/** New sessions include issue time and method; no server-side session table is needed. */
export function createSessionToken(lineUserId = '', now = Date.now(), method: SessionClaims['method'] = 'line'): string {
	const expiresAt = now + MAX_AGE_SECONDS * 1000;
	const payload = `v2.${lineUserId}.${now}.${expiresAt}.${method}`;
	return `${payload}.${sign(payload)}`;
}

export function verifySessionClaims(token: string | undefined, now = Date.now()): SessionClaims | null {
	if (!token || !config.dashboard.sessionSecret) return null;
	const parts = token.split('.');
	if (parts.length !== 6 || parts[0] !== 'v2') return null;
	const [, lineUserId, issuedRaw, expiresRaw, method, signature] = parts;
	if (!lineUserId || (method !== 'line' && method !== 'password')) return null;
	const issuedAt = Number(issuedRaw);
	const expiresAt = Number(expiresRaw);
	if (!Number.isSafeInteger(issuedAt) || issuedAt > now + 60_000 || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt <= issuedAt) return null;
	const payload = parts.slice(0, 5).join('.');
	if (!safeEqual(signature, sign(payload))) return null;
	return { lineUserId, issuedAt, expiresAt, method };
}

/** Legacy sessions remain valid for ordinary pages, but cannot authorize deletion. */
export function verifySessionToken(token: string | undefined, now = Date.now()): string | null {
	if (!token || !config.dashboard.sessionSecret) return null;
	const claims = verifySessionClaims(token, now);
	if (claims) return claims.lineUserId;
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [lineUserId, expiresRaw, signature] = parts;
	if (!lineUserId) return null;
	const expiresAt = Number(expiresRaw);
	if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;

	return safeEqual(signature, sign(`${lineUserId}.${expiresRaw}`)) ? lineUserId : null;
}

export function isRecentLineSession(claims: Pick<SessionClaims, 'issuedAt' | 'method'> | null, now = Date.now()): boolean {
	return Boolean(claims && claims.method === 'line' && claims.issuedAt <= now && now - claims.issuedAt <= RECENT_LINE_SESSION_MS);
}

/** A short-lived, signed second-step nonce bound to the current account. */
export function createAccountDeletionChallenge(userId: number, now = Date.now()): string {
	const expiresAt = now + DELETE_CONFIRMATION_SECONDS * 1000;
	const nonce = randomBytes(18).toString('base64url');
	const payload = `delete.${userId}.${expiresAt}.${nonce}`;
	return `${payload}.${sign(payload)}`;
}

export function verifyAccountDeletionChallenge(token: string | undefined, userId: number, now = Date.now()): boolean {
	if (!token || !config.dashboard.sessionSecret) return false;
	const parts = token.split('.');
	if (parts.length !== 5 || parts[0] !== 'delete' || Number(parts[1]) !== userId) return false;
	const expiresAt = Number(parts[2]);
	if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + DELETE_CONFIRMATION_SECONDS * 1000 + 60_000) return false;
	const payload = parts.slice(0, 4).join('.');
	return safeEqual(parts[4], sign(payload));
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
