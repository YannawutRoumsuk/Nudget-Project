import { and, asc, eq, gt, lt } from 'drizzle-orm';
import { db } from './index';
import { pendingSlips } from './schema';
import type { PendingSlip } from './schema';
import type { DbExecutor } from './queries';

export async function getPendingSlip(userId: number, executor: DbExecutor = db): Promise<PendingSlip | null> {
	const [row] = await executor
		.select()
		.from(pendingSlips)
		.where(eq(pendingSlips.userId, userId))
		.limit(1);
	return row ?? null;
}

export async function claimPendingSlip(id: number): Promise<PendingSlip | null> {
	const [row] = await db.update(pendingSlips)
		.set({ status: 'processing', updatedAt: new Date() })
		.where(and(eq(pendingSlips.id, id), eq(pendingSlips.status, 'queued')))
		.returning();
	return row ?? null;
}

/** Worker-side: slips from every user share one queue, oldest first. */
export async function claimNextPendingSlip(): Promise<PendingSlip | null> {
	const [next] = await db.select({ id: pendingSlips.id }).from(pendingSlips)
		.where(eq(pendingSlips.status, 'queued')).orderBy(asc(pendingSlips.createdAt)).limit(1);
	return next ? claimPendingSlip(next.id) : null;
}

export async function requeueStalePendingSlips(staleBefore: Date): Promise<number> {
	const rows = await db.update(pendingSlips)
		.set({ status: 'queued', updatedAt: new Date() })
		.where(and(eq(pendingSlips.status, 'processing'), lt(pendingSlips.updatedAt, staleBefore)))
		.returning({ id: pendingSlips.id });
	return rows.length;
}

export interface PendingSlipReplacement {
	slip: PendingSlip;
	/** The row this send superseded, or null when nothing was in flight. */
	replaced: PendingSlip | null;
}

/**
 * The slip this user is still waiting on, if any. OCR takes seconds, so the
 * caller checks this before it silently throws away someone's earlier slip.
 */
export async function getInFlightSlip(userId: number, executor: DbExecutor = db): Promise<PendingSlip | null> {
	const row = await getPendingSlip(userId, executor);
	return row && (row.status === 'queued' || row.status === 'processing') ? row : null;
}

/**
 * One slip per user, so a new one replaces whatever was there. The deleted row
 * comes back with the delete rather than from a separate read: two images sent
 * back to back would otherwise race, and the caller needs to know it cancelled
 * something to say so instead of a plain "รับสลิปแล้ว".
 */
export async function replacePendingSlip(
	values: Pick<typeof pendingSlips.$inferInsert, 'userId' | 'lineUserId' | 'messageId' | 'status'>,
	executor: DbExecutor = db
): Promise<PendingSlipReplacement> {
	const [replaced] = await executor
		.delete(pendingSlips)
		.where(eq(pendingSlips.userId, values.userId))
		.returning();
	const [slip] = await executor.insert(pendingSlips).values(values).returning();
	return { slip, replaced: replaced ?? null };
}

export async function updatePendingSlip(
	id: number,
	values: Partial<Pick<typeof pendingSlips.$inferInsert, 'status' | 'amount' | 'occurredAt' | 'categoryId' | 'paymentMethod' | 'note' | 'recipient' | 'reference' | 'ocrText' | 'expiresAt'>>
): Promise<PendingSlip | null> {
	const [row] = await db
		.update(pendingSlips)
		.set({ ...values, updatedAt: new Date() })
		.where(eq(pendingSlips.id, id))
		.returning();
	return row ?? null;
}

/** User-facing edits must match both the pending id and its owner. */
export async function updateOwnedPendingSlip(
	id: number,
	userId: number,
	values: Partial<Pick<typeof pendingSlips.$inferInsert, 'amount' | 'occurredAt' | 'categoryId' | 'note'>>,
	executor: DbExecutor = db
): Promise<PendingSlip | null> {
	const [row] = await executor
		.update(pendingSlips)
		.set({ ...values, updatedAt: new Date() })
		.where(and(
			eq(pendingSlips.id, id),
			eq(pendingSlips.userId, userId),
			eq(pendingSlips.status, 'ready'),
			gt(pendingSlips.expiresAt, new Date())
		))
		.returning();
	return row ?? null;
}

/**
 * Removes the ready slip before its transaction is inserted in the same DB
 * transaction. A second tap cannot consume the same slip again.
 */
export async function consumePendingSlip(
	id: number,
	userId: number,
	executor: DbExecutor = db
): Promise<PendingSlip | null> {
	const [row] = await executor
		.delete(pendingSlips)
		.where(and(
			eq(pendingSlips.id, id),
			eq(pendingSlips.userId, userId),
			eq(pendingSlips.status, 'ready'),
			gt(pendingSlips.expiresAt, new Date())
		))
		.returning();
	return row ?? null;
}

export async function deleteOwnedPendingSlip(
	id: number,
	userId: number,
	executor: DbExecutor = db
): Promise<boolean> {
	const rows = await executor.delete(pendingSlips)
		.where(and(eq(pendingSlips.id, id), eq(pendingSlips.userId, userId)))
		.returning({ id: pendingSlips.id });
	return rows.length > 0;
}

export async function deletePendingSlip(userId: number, executor: DbExecutor = db): Promise<boolean> {
	const rows = await executor
		.delete(pendingSlips)
		.where(eq(pendingSlips.userId, userId))
		.returning({ id: pendingSlips.id });
	return rows.length > 0;
}
