import { config } from './config';
import { activateUser, getUserByLineId } from './db/users';
import type { User } from './db/schema';

/**
 * Owners come from `LINE_ALLOWED_USER_ID`. They exist before any database row
 * does, and they are the only accounts that can see the member list or revoke
 * someone. Revoking an owner means removing them from that variable — flipping
 * `users.active` would leave nobody able to undo it.
 */
export function isOwner(lineUserId: string): boolean {
	return Boolean(lineUserId) && config.line.allowedUserIds.includes(lineUserId);
}

/**
 * The one place that answers "may this LINE account touch a ledger, and whose".
 * Returns null for accounts that were never created and for revoked ones.
 *
 * This runs on every dashboard request, so the common case is a plain read; a
 * write happens only when an owner has no row yet or was left inactive.
 */
export async function resolveMember(lineUserId: string): Promise<User | null> {
	if (!lineUserId) return null;
	const user = await getUserByLineId(lineUserId);
	if (user?.active) return user;
	return isOwner(lineUserId) ? activateUser(lineUserId) : null;
}

export type Admission =
	| { status: 'member'; user: User }
	| { status: 'joined'; user: User }
	/** Known, but an owner turned their access off. */
	| { status: 'revoked' };

/**
 * Adding the bot is the signup — there is nothing to type and nothing to paste.
 * The add-friend link is what limits who can find the bot at all, so the guard
 * against an unwanted account is visibility rather than a gate: owners are told
 * about every new member and can revoke one in a tap.
 */
export async function admit(
	lineUserId: string,
	/** Called only when an account is actually created, so returning members stay cheap. */
	resolveDisplayName: () => Promise<string> = async () => ''
): Promise<Admission> {
	if (!lineUserId) return { status: 'revoked' };

	const existing = await getUserByLineId(lineUserId);
	if (existing?.active) return { status: 'member', user: existing };
	// A revoked account does not quietly walk back in, unless it is an owner's:
	// their access is defined by configuration, not by the row.
	if (existing && !isOwner(lineUserId)) return { status: 'revoked' };

	const user = await activateUser(lineUserId, undefined, await resolveDisplayName());
	return { status: existing ? 'member' : 'joined', user };
}
