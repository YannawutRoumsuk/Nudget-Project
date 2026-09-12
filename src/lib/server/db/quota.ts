import { and, eq, sql } from 'drizzle-orm';
import { bangkokDayKey } from '$lib/utils/date';
import { db } from './index';
import { llmQuota, llmUsage } from './schema';

export type LlmWorkflow = 'parser' | 'ocr' | 'insights';

/**
 * A paid model call has to be claimed before it is made, in one statement.
 *
 * Reading a count and then writing the row afterwards leaves a window the whole
 * width of an HTTP request: two `analyze` submissions that overlap both read
 * the same total, both find room under the ceiling, and both spend money. The
 * upsert below increments and reports the new total atomically, so exactly one
 * request can be the Nth of the day.
 *
 * Returns true when this call is within the ceiling. A refused claim still
 * counts — someone hammering the endpoint does not get their attempts back.
 */
export async function claimLlmCall(
	userId: number,
	limit: number,
	now = new Date(),
	workflow: LlmWorkflow = 'insights'
): Promise<boolean> {
	const day = bangkokDayKey(now);
	const [row] = await db
		.insert(llmQuota)
		.values({ userId, day, workflow, used: 1 })
		.onConflictDoUpdate({
			target: [llmQuota.userId, llmQuota.day, llmQuota.workflow],
			set: { used: sql`${llmQuota.used} + 1` }
		})
		.returning({ used: llmQuota.used });
	return (row?.used ?? limit + 1) <= limit;
}

/**
 * Hands a claim back when the call never reached the provider, so a network
 * failure does not cost someone one of their few analyses for the day. Floored
 * at zero: a refund that outruns its claim would hand out free calls.
 */
export async function releaseLlmCall(userId: number, now = new Date(), workflow: LlmWorkflow = 'insights'): Promise<void> {
	const day = bangkokDayKey(now);
	await db
		.update(llmQuota)
		.set({ used: sql`greatest(${llmQuota.used} - 1, 0)` })
		.where(and(eq(llmQuota.userId, userId), eq(llmQuota.day, day), eq(llmQuota.workflow, workflow)));
}

/** What the page shows when someone has run out for the day. */
export async function llmCallsUsed(userId: number, now = new Date(), workflow: LlmWorkflow = 'insights'): Promise<number> {
	const [row] = await db
		.select({ used: llmQuota.used })
		.from(llmQuota)
		.where(and(
			eq(llmQuota.userId, userId),
			eq(llmQuota.day, bangkokDayKey(now)),
			eq(llmQuota.workflow, workflow)
		));
	return row?.used ?? 0;
}

export interface LlmUsageEvent {
	userId: number;
	workflow: LlmWorkflow;
	provider: string;
	model: string;
	inputTokens?: number;
	outputTokens?: number;
	success: boolean;
	errorCode?: string | null;
}

/** Stores counters only; prompts and model output must never enter this table. */
export async function recordLlmUsage(event: LlmUsageEvent): Promise<void> {
	await db.insert(llmUsage).values({
		...event,
		inputTokens: Math.max(0, Math.trunc(event.inputTokens ?? 0)),
		outputTokens: Math.max(0, Math.trunc(event.outputTokens ?? 0)),
		errorCode: event.errorCode?.slice(0, 32) || null
	});
}
