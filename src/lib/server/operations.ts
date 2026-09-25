import { and, count, desc, eq, gte, isNotNull, like, lt, min, or, sql, sum } from 'drizzle-orm';
import { bangkokParts, fromBangkok } from '$lib/utils/date';
import { db } from './db';
import { llmUsage, pendingSlips, systemEvents } from './db/schema';

export type SystemEventType = 'webhook' | 'reminder_run' | 'backup' | 'line_push' | 'ocr_failure';

/** Best-effort instrumentation: monitoring must never block the user-facing operation. */
export async function recordSystemEvent(
	eventType: SystemEventType,
	success = true,
	errorCode: string | null = null
): Promise<void> {
	try {
		await db.insert(systemEvents).values({ eventType, success, errorCode: success ? null : safeCode(errorCode) });
		if (eventType === 'reminder_run' && success && new Date().getUTCHours() === 0) {
			await db.delete(systemEvents).where(lt(systemEvents.createdAt, new Date(Date.now() - 90 * 86_400_000)));
		}
	} catch {
		console.error(`[ops] could not record ${eventType} metric`);
	}
}

function safeCode(value: string | null): string | null {
	if (!value) return null;
	return /^[a-z0-9_-]{1,32}$/i.test(value) ? value : 'other';
}

export async function databaseReady(): Promise<boolean> {
	try {
		await db.execute(sql`select 1`);
		return true;
	} catch {
		return false;
	}
}

interface ActivityPoint { at: Date; success: boolean; errorCode: string | null }

async function latestEvent(eventType: SystemEventType): Promise<ActivityPoint | null> {
	const [row] = await db.select({ at: systemEvents.createdAt, success: systemEvents.success, errorCode: systemEvents.errorCode })
		.from(systemEvents).where(eq(systemEvents.eventType, eventType)).orderBy(desc(systemEvents.createdAt)).limit(1);
	return row ?? null;
}

async function linePushCount(since: Date): Promise<number> {
	const [row] = await db.select({ total: count() }).from(systemEvents)
		.where(and(eq(systemEvents.eventType, 'line_push'), eq(systemEvents.success, true), gte(systemEvents.createdAt, since)));
	return row?.total ?? 0;
}

async function geminiUsage(since: Date) {
	const [row] = await db.select({
		calls: count(),
		input: sum(llmUsage.inputTokens),
		output: sum(llmUsage.outputTokens)
	}).from(llmUsage).where(and(
		or(eq(llmUsage.provider, 'gemini'), and(eq(llmUsage.provider, 'openrouter'), like(llmUsage.model, '%gemini%'))),
		gte(llmUsage.createdAt, since)
	));
	return { calls: row?.calls ?? 0, inputTokens: Number(row?.input ?? 0), outputTokens: Number(row?.output ?? 0) };
}

export async function getOperationsDashboard(now = new Date()) {
	const parts = bangkokParts(now);
	const dayStart = fromBangkok(parts.year, parts.month, parts.day);
	const monthStart = fromBangkok(parts.year, parts.month, 1);
	const [webhook, reminders, backup, queued, geminiToday, geminiMonth, pushesToday, pushesMonth, failures] = await Promise.all([
		latestEvent('webhook'), latestEvent('reminder_run'), latestEvent('backup'),
		db.select({ status: pendingSlips.status, count: count(), oldest: min(pendingSlips.createdAt) }).from(pendingSlips).groupBy(pendingSlips.status),
		geminiUsage(dayStart), geminiUsage(monthStart), linePushCount(dayStart), linePushCount(monthStart),
		db.select({ eventType: systemEvents.eventType, createdAt: systemEvents.createdAt, errorCode: systemEvents.errorCode })
			.from(systemEvents).where(eq(systemEvents.success, false)).orderBy(desc(systemEvents.createdAt)).limit(5)
	]);
	const [llmFailures] = await db.select({ count: count() }).from(llmUsage)
		.where(and(eq(llmUsage.success, false), isNotNull(llmUsage.errorCode), gte(llmUsage.createdAt, fromBangkok(parts.year, parts.month, parts.day - 30))));
	return {
		components: { webhook, reminders, backup },
		ocrQueue: queued.map((row) => ({ status: row.status, count: row.count, oldest: row.oldest })),
		usage: { gemini: { today: geminiToday, month: geminiMonth }, linePushes: { today: pushesToday, month: pushesMonth } },
		errors: failures.map((row) => ({ source: row.eventType, code: row.errorCode ?? 'unknown', at: row.createdAt })),
		llmFailures30d: llmFailures?.count ?? 0
	};
}
