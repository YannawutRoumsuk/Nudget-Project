import { and, asc, eq, lt } from 'drizzle-orm';
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

export async function replacePendingSlip(
	values: Pick<typeof pendingSlips.$inferInsert, 'userId' | 'lineUserId' | 'messageId' | 'status'>,
	executor: DbExecutor = db
): Promise<PendingSlip> {
	await executor.delete(pendingSlips).where(eq(pendingSlips.userId, values.userId));
	const [row] = await executor.insert(pendingSlips).values(values).returning();
	return row;
}

export async function updatePendingSlip(
	id: number,
	values: Partial<Pick<typeof pendingSlips.$inferInsert, 'status' | 'amount' | 'occurredAt' | 'recipient' | 'reference' | 'ocrText'>>
): Promise<PendingSlip | null> {
	const [row] = await db
		.update(pendingSlips)
		.set({ ...values, updatedAt: new Date() })
		.where(eq(pendingSlips.id, id))
		.returning();
	return row ?? null;
}

export async function deletePendingSlip(userId: number, executor: DbExecutor = db): Promise<boolean> {
	const rows = await executor
		.delete(pendingSlips)
		.where(eq(pendingSlips.userId, userId))
		.returning({ id: pendingSlips.id });
	return rows.length > 0;
}
