import { config } from './config';
import { ensureUser, getUserByLineId } from './db/users';
import type { User } from './db/schema';

/**
 * Accounts named in `LINE_ALLOWED_USER_ID` bootstrap the system: they exist
 * before any database row does, and only they may hand out invites. Everyone
 * else joins by redeeming an invite, which is what keeps adding a person from
 * needing an env edit and a redeploy.
 */
export function isOwner(lineUserId: string): boolean {
	return Boolean(lineUserId) && config.line.allowedUserIds.includes(lineUserId);
}

/**
 * The one place that answers "may this LINE account touch a ledger, and whose".
 * Returns null for strangers and for accounts whose access was revoked.
 */
export async function resolveMember(lineUserId: string): Promise<User | null> {
	if (!lineUserId) return null;
	if (isOwner(lineUserId)) return ensureUser(lineUserId);
	const user = await getUserByLineId(lineUserId);
	return user?.active ? user : null;
}
