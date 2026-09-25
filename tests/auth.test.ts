import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

process.env.SESSION_SECRET = 'session-test-secret';

const { createAccountDeletionChallenge, createSessionToken, isRecentLineSession, verifyAccountDeletionChallenge, verifySessionClaims, verifySessionToken } = await import('../src/lib/server/auth');

describe('destructive-action session proof', () => {
	it('records fresh LINE sessions while keeping old signed sessions valid for normal pages', () => {
		const now = 1_800_000_000_000;
		const token = createSessionToken('Uprivacy', now, 'line');
		const claims = verifySessionClaims(token, now + 1000);
		expect(claims).toMatchObject({ lineUserId: 'Uprivacy', issuedAt: now, method: 'line' });
		expect(isRecentLineSession(claims, now + 60_000)).toBe(true);
		expect(isRecentLineSession(claims, now + 6 * 60_000)).toBe(false);

		const payload = `Ulegacy.${now + 60_000}`;
		const legacy = `${payload}.${createHmac('sha256', 'session-test-secret').update(payload).digest('base64url')}`;
		expect(verifySessionToken(legacy, now)).toBe('Ulegacy');
		expect(verifySessionClaims(legacy, now)).toBeNull();
	});

	it('requires a fresh LINE session, not a password login', () => {
		const now = 1_800_000_000_000;
		const password = verifySessionClaims(createSessionToken('Uprivacy', now, 'password'), now);
		expect(isRecentLineSession(password, now)).toBe(false);
	});

	it('binds the second-step deletion challenge to one account and a short expiry', () => {
		const now = 1_800_000_000_000;
		const challenge = createAccountDeletionChallenge(12, now);
		expect(verifyAccountDeletionChallenge(challenge, 12, now + 1000)).toBe(true);
		expect(verifyAccountDeletionChallenge(challenge, 13, now + 1000)).toBe(false);
		expect(verifyAccountDeletionChallenge(challenge, 12, now + 11 * 60_000)).toBe(false);
		expect(verifyAccountDeletionChallenge(`${challenge}x`, 12, now + 1000)).toBe(false);
	});
});
