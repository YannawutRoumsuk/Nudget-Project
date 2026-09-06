import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';
import type { User } from './schema';
import type { DbExecutor } from './queries';

export async function getUserByLineId(lineUserId: string, executor: DbExecutor = db): Promise<User | null> {
	if (!lineUserId) return null;
	const [row] = await executor.select().from(users).where(eq(users.lineUserId, lineUserId)).limit(1);
	return row ?? null;
}

/**
 * Called on the first message or login from an allowed LINE account. The insert
 * races with itself when someone types while the LIFF page is loading, so a
 * conflict falls back to the row the other request already committed.
 */
export async function ensureUser(lineUserId: string, executor: DbExecutor = db): Promise<User> {
	if (!lineUserId) throw new Error('ensureUser requires a LINE user id');
	const [inserted] = await executor
		.insert(users)
		.values({ lineUserId })
		.onConflictDoNothing({ target: users.lineUserId })
		.returning();
	if (inserted) return inserted;
	const existing = await getUserByLineId(lineUserId, executor);
	if (!existing) throw new Error(`could not create or load user ${lineUserId}`);
	return existing;
}

export async function setDisplayName(id: number, displayName: string): Promise<void> {
	await db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function listUsers(executor: DbExecutor = db): Promise<User[]> {
	return executor.select().from(users).where(eq(users.active, true));
}
