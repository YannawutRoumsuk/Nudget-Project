import { and, eq } from 'drizzle-orm';
import { isOwner } from '$lib/server/access';
import { db } from './index';
import { users } from './schema';

export type AccountDeletionResult = 'deleted' | 'not_found' | 'owner_protected';

export async function canDeleteAccount(lineUserId: string): Promise<boolean> {
	if (!lineUserId) return false;
	// Owners are re-created from LINE_ALLOWED_USER_ID on every sign-in. They must
	// first transfer ownership and remove their own ID from that allowlist.
	return !isOwner(lineUserId);
}

/** Hard-deletes only the caller's row; all owned records cascade in one transaction. */
export async function deleteOwnAccount(userId: number, lineUserId: string): Promise<AccountDeletionResult> {
	if (!userId || !lineUserId) return 'not_found';
	return db.transaction(async (executor) => {
		const [account] = await executor.select({ id: users.id, lineUserId: users.lineUserId })
			.from(users).where(and(eq(users.id, userId), eq(users.lineUserId, lineUserId))).limit(1);
		if (!account) return 'not_found';
		if (isOwner(lineUserId)) return 'owner_protected';
		const removed = await executor.delete(users).where(and(eq(users.id, userId), eq(users.lineUserId, lineUserId))).returning({ id: users.id });
		return removed.length ? 'deleted' : 'not_found';
	});
}
