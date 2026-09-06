import { createHash, randomInt } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from './index';
import { userInvites, users } from './schema';
import type { User } from './schema';

/** No I/O/0/1 — the code gets read off one phone and typed into another. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/** 10 chars of a 32-symbol alphabet is 50 bits — not worth guessing at LINE's rate. */
function generateCode(): string {
	let code = '';
	for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
	return code;
}

/** Accepts what a person actually types: spaces, dashes and lower case. */
export function normalizeInviteCode(input: string): string | null {
	const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (cleaned.length !== CODE_LENGTH) return null;
	return [...cleaned].every((char) => ALPHABET.includes(char)) ? cleaned : null;
}

/** Codes carry their own entropy, so a plain digest is enough — no salt needed. */
function hashCode(code: string): string {
	return createHash('sha256').update(code).digest('hex');
}

export function formatInviteCode(code: string): string {
	return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export async function createInvite(invitedBy: number, now = new Date()): Promise<string> {
	const code = generateCode();
	await db.insert(userInvites).values({
		codeHash: hashCode(code),
		invitedBy,
		expiresAt: new Date(now.getTime() + INVITE_TTL_MS)
	});
	return code;
}

/**
 * Single-use and time-boxed. The claim and the account creation share one
 * transaction so two people racing the same code cannot both get in, and the
 * conditional update is what makes the second attempt lose.
 */
export async function redeemInvite(rawCode: string, lineUserId: string, now = new Date()): Promise<User | null> {
	const code = normalizeInviteCode(rawCode);
	if (!code || !lineUserId) return null;

	return db.transaction(async (executor) => {
		const [invite] = await executor
			.select({ id: userInvites.id })
			.from(userInvites)
			.where(and(eq(userInvites.codeHash, hashCode(code)), isNull(userInvites.usedAt), gt(userInvites.expiresAt, now)))
			.limit(1);
		if (!invite) return null;

		const [existing] = await executor.select().from(users).where(eq(users.lineUserId, lineUserId)).limit(1);
		const user = existing
			? (await executor.update(users).set({ active: true, updatedAt: now }).where(eq(users.id, existing.id)).returning())[0]
			: (await executor.insert(users).values({ lineUserId }).returning())[0];

		const claimed = await executor
			.update(userInvites)
			.set({ usedAt: now, usedBy: user.id })
			.where(and(eq(userInvites.id, invite.id), isNull(userInvites.usedAt)))
			.returning({ id: userInvites.id });
		if (claimed.length === 0) throw new Error('invite was claimed concurrently');

		return user;
	});
}
