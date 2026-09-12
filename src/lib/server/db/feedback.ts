import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { toNumber } from '$lib/utils/money';
import { db } from './index';
import { feedback, users } from './schema';
import type { Feedback, FeedbackStatus } from './schema';
import type { DbExecutor } from './queries';

/**
 * Shared with the LINE side so a member typing feedback and this admin page
 * agree on what "too many today" and "too long" mean without importing across
 * the LINE/web boundary.
 */
export const FEEDBACK_DAILY_LIMIT = 5;
export const FEEDBACK_MAX_LENGTH = 1000;

/** Plenty for an owner triaging a backlog; keeps a runaway list off one page. */
const LIST_LIMIT = 200;

export interface FeedbackView extends Feedback {
	/** The sender's display name as of right now, not as of when they wrote in. */
	currentDisplayName: string;
}

export async function createFeedback(
	values: typeof feedback.$inferInsert,
	executor: DbExecutor = db
): Promise<Feedback> {
	const [row] = await executor.insert(feedback).values(values).returning();
	return row;
}

/**
 * Owner-only triage view across every member, so unlike almost everything else
 * in `db/`, this one deliberately does not filter by `userId`.
 */
export async function listFeedback(options: { status?: FeedbackStatus } = {}): Promise<FeedbackView[]> {
	const rows = await db
		.select({
			id: feedback.id,
			userId: feedback.userId,
			lineUserId: feedback.lineUserId,
			displayName: feedback.displayName,
			message: feedback.message,
			status: feedback.status,
			createdAt: feedback.createdAt,
			resolvedAt: feedback.resolvedAt,
			currentDisplayName: users.displayName
		})
		.from(feedback)
		.leftJoin(users, eq(users.id, feedback.userId))
		.where(options.status ? eq(feedback.status, options.status) : undefined)
		.orderBy(desc(feedback.createdAt), desc(feedback.id))
		.limit(LIST_LIMIT);

	return rows.map((row) => ({ ...row, currentDisplayName: row.currentDisplayName ?? '' }));
}

/**
 * `resolvedAt` follows `status` rather than being set independently — moving a
 * row back out of 'done' (a mis-click, or new information) has to clear it, or
 * the timestamp would keep claiming a resolution that no longer holds.
 */
export async function setFeedbackStatus(id: number, status: FeedbackStatus): Promise<Feedback | null> {
	const [row] = await db
		.update(feedback)
		.set({ status, resolvedAt: status === 'done' ? new Date() : null })
		.where(eq(feedback.id, id))
		.returning();
	return row ?? null;
}

/**
 * The per-day rate limit the LINE side enforces before it ever calls
 * `createFeedback`. Filtered by `userId` — this is the one feedback query that
 * reads a single person's rows rather than the whole queue.
 */
export async function countFeedbackSince(userId: number, since: Date, executor: DbExecutor = db): Promise<number> {
	const [row] = await executor
		.select({ total: sql<string>`count(*)` })
		.from(feedback)
		.where(and(eq(feedback.userId, userId), gte(feedback.createdAt, since)));
	return toNumber(row?.total);
}

/** Counts backing the status tabs on the admin page, including empty ones. */
export async function countFeedbackByStatus(): Promise<Record<FeedbackStatus, number>> {
	const rows = await db
		.select({ status: feedback.status, total: sql<string>`count(*)` })
		.from(feedback)
		.groupBy(feedback.status);

	const counts: Record<FeedbackStatus, number> = { new: 0, read: 0, done: 0 };
	for (const row of rows) counts[row.status] = toNumber(row.total);
	return counts;
}
