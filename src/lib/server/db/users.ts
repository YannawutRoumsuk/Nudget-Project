import { and, count, desc, eq, max } from 'drizzle-orm';
import { db } from './index';
import { transactions, users } from './schema';
import type { PendingAction, User } from './schema';
import type { DbExecutor } from './queries';

export async function getUserByLineId(lineUserId: string, executor: DbExecutor = db): Promise<User | null> {
	if (!lineUserId) return null;
	const [row] = await executor.select().from(users).where(eq(users.lineUserId, lineUserId)).limit(1);
	return row ?? null;
}

/**
 * Called on the first message or login from a LINE account. The insert races
 * with itself when someone types while the LIFF page is loading, so a conflict
 * falls back to the row the other request already committed.
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

/** Creates the account, or switches a revoked one back on. */
export async function activateUser(lineUserId: string, executor: DbExecutor = db, displayName = ''): Promise<User> {
	const [row] = await executor
		.insert(users)
		.values({ lineUserId, displayName })
		.onConflictDoUpdate({ target: users.lineUserId, set: { active: true, updatedAt: new Date() } })
		.returning();
	return row;
}

export async function setUserActive(id: number, active: boolean): Promise<User | null> {
	const [row] = await db.update(users).set({ active, updatedAt: new Date() }).where(eq(users.id, id)).returning();
	return row ?? null;
}

export async function setDisplayName(id: number, displayName: string): Promise<void> {
	await db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function listUsers(executor: DbExecutor = db): Promise<User[]> {
	return executor.select().from(users).where(eq(users.active, true));
}

export interface MemberSummary {
	id: number;
	lineUserId: string;
	displayName: string;
	active: boolean;
	joinedAt: Date;
	transactionCount: number;
	lastActivityAt: Date | null;
}

/**
 * Who is using the bot, when they joined and whether they are actually using
 * it. Activity is derived from the ledger rather than tracked separately, so
 * watching the member list costs nothing on the message path.
 */
export async function listMembers(): Promise<MemberSummary[]> {
	// Drizzle's aggregate helpers keep the column's own decoder, so `max` comes
	// back as a Date. A raw sql`max(...)` hands back Postgres' string form and
	// every date formatter downstream then receives the wrong type.
	const rows = await db
		.select({
			id: users.id,
			lineUserId: users.lineUserId,
			displayName: users.displayName,
			active: users.active,
			joinedAt: users.createdAt,
			transactionCount: count(transactions.id),
			lastActivityAt: max(transactions.occurredAt)
		})
		.from(users)
		.leftJoin(transactions, eq(transactions.userId, users.id))
		.groupBy(users.id)
		.orderBy(desc(users.createdAt));

	return rows;
}

/**
 * Puts the person into a one-shot conversational mode, so the next message they
 * send is read as an answer rather than as an expense. Written to the row
 * because a webhook holds no session and the process restarts on every deploy.
 */
export async function setPendingAction(
	userId: number,
	action: PendingAction | null,
	executor: DbExecutor = db
): Promise<void> {
	await executor
		.update(users)
		.set({
			pendingAction: action,
			pendingActionAt: action ? new Date() : null,
			updatedAt: new Date()
		})
		.where(eq(users.id, userId));
}

/**
 * Ends the mode and reports whether this caller is the one that ended it.
 *
 * Two webhook deliveries for the same person can overlap, and a plain
 * check-then-write would let both through: under READ COMMITTED they would each
 * read the state before the other wrote. Postgres serialises concurrent updates
 * of one row, so the loser sees zero rows and stops — and the winner holds that
 * row's lock for the rest of its transaction, which is what makes the daily
 * count that follows trustworthy too.
 */
export async function claimPendingAction(
	userId: number,
	action: PendingAction,
	executor: DbExecutor = db
): Promise<boolean> {
	const rows = await executor
		.update(users)
		.set({ pendingAction: null, pendingActionAt: null, updatedAt: new Date() })
		.where(and(eq(users.id, userId), eq(users.pendingAction, action)))
		.returning({ id: users.id });
	return rows.length > 0;
}

/**
 * A mode nobody finished is worse than no mode at all: someone who typed
 * "ฟีดแบ็ก" yesterday and an expense today must get the expense recorded.
 */
export function pendingActionIsLive(user: Pick<User, 'pendingAction' | 'pendingActionAt'>, now: Date): boolean {
	if (!user.pendingAction || !user.pendingActionAt) return false;
	return now.getTime() - user.pendingActionAt.getTime() < PENDING_ACTION_TTL_MS;
}

/** Ten minutes is long enough to type a paragraph and short enough to forget. */
export const PENDING_ACTION_TTL_MS = 10 * 60 * 1000;
