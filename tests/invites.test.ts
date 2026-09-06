import { describe, expect, it } from 'vitest';
import { formatInviteCode, normalizeInviteCode } from '../src/lib/server/db/invites';

describe('invite codes', () => {
	it('accepts what someone actually types back', () => {
		expect(normalizeInviteCode('abcde-23456')).toBe('ABCDE23456');
		expect(normalizeInviteCode('ABCDE 23456')).toBe('ABCDE23456');
		expect(normalizeInviteCode(' ABCDE23456 ')).toBe('ABCDE23456');
	});

	it('rejects anything that is not a code', () => {
		expect(normalizeInviteCode('ข้าว 60')).toBeNull();
		expect(normalizeInviteCode('ABCDE2345')).toBeNull();
		expect(normalizeInviteCode('ABCDE234567')).toBeNull();
		expect(normalizeInviteCode('')).toBeNull();
	});

	it('rejects the letters left out of the alphabet so a misread cannot pass', () => {
		expect(normalizeInviteCode('ABCDEI2345')).toBeNull();
		expect(normalizeInviteCode('ABCDEO2345')).toBeNull();
		expect(normalizeInviteCode('ABCDE01234')).toBeNull();
	});

	it('round-trips its own display format', () => {
		expect(normalizeInviteCode(formatInviteCode('ABCDE23456'))).toBe('ABCDE23456');
	});
});
