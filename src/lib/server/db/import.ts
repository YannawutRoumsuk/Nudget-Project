import { createHash } from 'node:crypto';
import { and, eq, gte, lt, or } from 'drizzle-orm';
import { transactionImportKey } from '$lib/csv-import';
import type { ImportedTransaction } from '$lib/csv-import';
import { addDays, bangkokDayStart } from '$lib/utils/date';
import { bangkokDayKey } from '$lib/utils/date';
import { db } from './index';
import { transactions } from './schema';
import type { DbExecutor } from './queries';
import { insertTransaction, insertTransactionIfUnique } from './queries';

async function findMatchingExisting(userId: number, entries: ImportedTransaction[], executor: DbExecutor): Promise<Set<string>> {
	const candidates = new Map<string, ImportedTransaction>();
	for (const entry of entries) candidates.set(transactionImportKey(entry), entry);
	if (!candidates.size) return new Set();
	const conditions = [...candidates.values()].map((entry) => {
		const start = bangkokDayStart(entry.occurredAt);
		return and(eq(transactions.kind, entry.kind), eq(transactions.amount, entry.amount), eq(transactions.categoryId, entry.categoryId),
			eq(transactions.note, entry.note), eq(transactions.paymentMethod, entry.paymentMethod),
			gte(transactions.occurredAt, start), lt(transactions.occurredAt, addDays(start, 1)));
	});
	const matches = await executor.select({
		kind: transactions.kind, amount: transactions.amount, categoryId: transactions.categoryId, note: transactions.note,
		paymentMethod: transactions.paymentMethod, occurredAt: transactions.occurredAt
	}).from(transactions).where(and(eq(transactions.userId, userId), or(...conditions)));
	return new Set(matches.map((row) => transactionImportKey({
		day: bangkokDayKey(row.occurredAt), kind: row.kind, amount: row.amount, categoryId: row.categoryId,
		note: row.note, paymentMethod: row.paymentMethod
	})));
}

export async function previewImportDuplicates(userId: number, entries: ImportedTransaction[]): Promise<Set<string>> {
	return findMatchingExisting(userId, entries, db);
}

/** Insert one confirmed CSV batch atomically; every row is revalidated by the caller and duplicates rechecked here. */
export async function saveImportedTransactions(userId: number, entries: ImportedTransaction[], includeDuplicates: boolean) {
	return db.transaction(async (executor) => {
		const existing = await findMatchingExisting(userId, entries, executor);
		const seen = new Set<string>();
		let inserted = 0;
		let skippedDuplicates = 0;
		for (const entry of entries) {
			const key = transactionImportKey(entry);
			const duplicate = existing.has(key) || seen.has(key);
			seen.add(key);
			if (duplicate && !includeDuplicates) { skippedDuplicates += 1; continue; }
			const values = {
				userId, kind: entry.kind, amount: entry.amount, categoryId: entry.categoryId, note: entry.note,
				occurredAt: entry.occurredAt, paymentMethod: entry.paymentMethod,
				source: 'web' as const, parsedBy: 'manual' as const, rawText: 'นำเข้าจาก CSV'
			};
			const row = duplicate
				? await insertTransaction(values, executor)
				: await insertTransactionIfUnique({ ...values, fingerprint: createHash('sha256').update(`${userId}:${key}`).digest('hex') }, executor);
			if (row) inserted += 1;
			else skippedDuplicates += 1;
		}
		return { inserted, skippedDuplicates };
	});
}
