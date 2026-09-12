import { and, desc, eq } from 'drizzle-orm';
import { insightSchema } from '$lib/server/insights/generate';
import type { Insight } from '$lib/server/insights/generate';
import { db } from './index';
import { insights } from './schema';
import type { StoredInsight } from './schema';
import type { DbExecutor } from './queries';

/**
 * Each analysis is a paid model call, so the ceiling is per person per day
 * rather than per request. Ten is far past what reading one's own months takes
 * and still bounds what a stuck reload loop can spend.
 */
export const INSIGHT_DAILY_LIMIT = 10;

/**
 * The stored analysis for exactly these numbers. A payload that no longer
 * parses is a cache miss, not an error: the row is data we wrote once, not
 * something to trust on the way back out.
 */
export async function getCachedInsight(
	userId: number,
	month: string,
	fingerprint: string
): Promise<{ insight: Insight; createdAt: Date; model: string } | null> {
	const [row] = await db
		.select()
		.from(insights)
		.where(
			and(
				eq(insights.userId, userId),
				eq(insights.month, month),
				eq(insights.fingerprint, fingerprint)
			)
		)
		.limit(1);

	const insight = row ? toInsight(row) : null;
	return insight ? { insight, createdAt: row.createdAt, model: row.model } : null;
}

/**
 * Upsert rather than insert: the unique index is the same triple we look up by,
 * and a re-run for numbers that have not changed should replace the paragraph
 * instead of failing. `createdAt` moves with it so the daily limit counts the
 * call that was actually made.
 */
export async function saveInsight(
	userId: number,
	month: string,
	fingerprint: string,
	insight: Insight,
	model: string,
	executor: DbExecutor = db
): Promise<void> {
	const payload = JSON.stringify(insight);
	await executor
		.insert(insights)
		.values({ userId, month, fingerprint, payload, model })
		.onConflictDoUpdate({
			target: [insights.userId, insights.month, insights.fingerprint],
			set: { payload, model, createdAt: new Date() }
		});
}

/**
 * The most recent analysis of a month whatever its numbers were. Lets the page
 * show last night's read of a month that has moved since, labelled as stale,
 * instead of nothing at all.
 */
export async function getLatestInsight(
	userId: number,
	month: string
): Promise<{ insight: Insight; createdAt: Date; model: string; fingerprint: string } | null> {
	const [row] = await db
		.select()
		.from(insights)
		.where(and(eq(insights.userId, userId), eq(insights.month, month)))
		.orderBy(desc(insights.createdAt), desc(insights.id))
		.limit(1);

	const insight = row ? toInsight(row) : null;
	return insight
		? { insight, createdAt: row.createdAt, model: row.model, fingerprint: row.fingerprint }
		: null;
}

function toInsight(row: StoredInsight): Insight | null {
	let json: unknown;
	try {
		json = JSON.parse(row.payload);
	} catch {
		console.warn(`[insights] stored payload for ${row.month} is not JSON`);
		return null;
	}

	const parsed = insightSchema.safeParse(json);
	if (!parsed.success) {
		// Usually means the schema tightened under rows written by an older
		// build; regenerating is cheaper than migrating a paragraph.
		console.warn(`[insights] stored payload for ${row.month} no longer validates`);
		return null;
	}
	return parsed.data;
}
