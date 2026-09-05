import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from './index';
import { processedEvents, reminderDeliveries, transactions } from './schema';
import type { NewTransaction, PaymentMethod, Transaction, TxKind } from './schema';
import { toNumber } from '$lib/utils/money';

export type DbExecutor = Pick<typeof db, 'insert' | 'select' | 'update' | 'delete'>;

export async function claimReminderDelivery(key: string, executor: DbExecutor = db): Promise<boolean> {
	const rows = await executor.insert(reminderDeliveries).values({ key }).onConflictDoNothing().returning({ key: reminderDeliveries.key });
	return rows.length > 0;
}

export async function releaseReminderDelivery(key: string, executor: DbExecutor = db): Promise<void> {
	await executor.delete(reminderDeliveries).where(eq(reminderDeliveries.key, key));
}

export interface Range {
	from: Date;
	/** Exclusive. */
	to: Date;
}

export interface Totals {
	income: number;
	expense: number;
	net: number;
	count: number;
}

export interface CategorySlice {
	categoryId: string;
	total: number;
	count: number;
}

export interface DayPoint {
	day: string; // YYYY-MM-DD in Bangkok time
	income: number;
	expense: number;
}

/**
 * Every aggregate buckets on Bangkok local time. Doing the conversion inside
 * Postgres keeps the grouping and the WHERE clause consistent.
 */
const BANGKOK_DAY = sql`to_char(${transactions.occurredAt} AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')`;

function inRange({ from, to }: Range) {
	return and(gte(transactions.occurredAt, from), lt(transactions.occurredAt, to));
}

export async function insertTransaction(tx: NewTransaction, executor: DbExecutor = db): Promise<Transaction> {
	const [row] = await executor.insert(transactions).values(tx).returning();
	return row;
}

export async function deleteTransaction(id: number, executor: DbExecutor = db): Promise<boolean> {
	const deleted = await executor.delete(transactions).where(eq(transactions.id, id)).returning({
		id: transactions.id
	});
	return deleted.length > 0;
}

export async function getTransaction(id: number): Promise<Transaction | null> {
	const [row] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
	return row ?? null;
}

export async function updateTransaction(
	id: number,
	values: Partial<Pick<NewTransaction, 'kind' | 'amount' | 'categoryId' | 'note' | 'occurredAt' | 'paymentMethod'>>
): Promise<Transaction | null> {
	const [row] = await db.update(transactions).set(values).where(eq(transactions.id, id)).returning();
	return row ?? null;
}

export async function deleteLatestTransaction(executor: DbExecutor = db): Promise<Transaction | null> {
	const [latest] = await executor
		.select()
		.from(transactions)
		.orderBy(desc(transactions.createdAt), desc(transactions.id))
		.limit(1);
	if (!latest) return null;
	await deleteTransaction(latest.id, executor);
	return latest;
}

export async function getTotals(range: Range, executor: DbExecutor = db): Promise<Totals> {
	const rows = await executor
		.select({
			kind: transactions.kind,
			total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
			count: sql<string>`count(*)`
		})
		.from(transactions)
		.where(inRange(range))
		.groupBy(transactions.kind);

	const totals: Totals = { income: 0, expense: 0, net: 0, count: 0 };
	for (const row of rows) {
		const amount = toNumber(row.total);
		if (row.kind === 'income') totals.income = amount;
		else totals.expense = amount;
		totals.count += Number(row.count);
	}
	totals.net = totals.income - totals.expense;
	return totals;
}

export async function getPaymentMethodTotal(range: Range, paymentMethod: PaymentMethod, executor: DbExecutor = db): Promise<number> {
	const [row] = await executor.select({ total: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
		.from(transactions)
		.where(and(inRange(range), eq(transactions.kind, 'expense'), eq(transactions.paymentMethod, paymentMethod)));
	return toNumber(row?.total ?? 0);
}

export async function getByCategory(range: Range, kind: TxKind, executor: DbExecutor = db): Promise<CategorySlice[]> {
	const rows = await executor
		.select({
			categoryId: transactions.categoryId,
			total: sql<string>`sum(${transactions.amount})`,
			count: sql<string>`count(*)`
		})
		.from(transactions)
		.where(and(inRange(range), eq(transactions.kind, kind)))
		.groupBy(transactions.categoryId)
		.orderBy(desc(sql`sum(${transactions.amount})`));

	return rows.map((row) => ({
		categoryId: row.categoryId,
		total: toNumber(row.total),
		count: Number(row.count)
	}));
}

export async function getDailySeries(range: Range): Promise<DayPoint[]> {
	const rows = await db
		.select({
			day: sql<string>`${BANGKOK_DAY}`,
			kind: transactions.kind,
			total: sql<string>`sum(${transactions.amount})`
		})
		.from(transactions)
		.where(inRange(range))
		.groupBy(sql`1`, transactions.kind)
		.orderBy(sql`1`);

	const byDay = new Map<string, DayPoint>();
	for (const row of rows) {
		const point = byDay.get(row.day) ?? { day: row.day, income: 0, expense: 0 };
		if (row.kind === 'income') point.income = toNumber(row.total);
		else point.expense = toNumber(row.total);
		byDay.set(row.day, point);
	}
	return [...byDay.values()];
}

export async function listTransactions(
	range: Range,
	options: { limit?: number; kind?: TxKind; categoryId?: string } = {}
): Promise<Transaction[]> {
	const filters = [inRange(range)];
	if (options.kind) filters.push(eq(transactions.kind, options.kind));
	if (options.categoryId) filters.push(eq(transactions.categoryId, options.categoryId));

	return db
		.select()
		.from(transactions)
		.where(and(...filters))
		.orderBy(desc(transactions.occurredAt), desc(transactions.id))
		.limit(options.limit ?? 200);
}

/**
 * The deduplication marker and ledger changes commit together. A failure rolls
 * both back, allowing LINE to retry. A concurrent duplicate waits for the first
 * transaction, then either skips its committed event or takes over after rollback.
 */
export async function processEventOnce<T>(
	eventId: string,
	work: (executor: DbExecutor) => Promise<T>
): Promise<T | null> {
	return db.transaction(async (executor) => {
		const claimed = await executor
			.insert(processedEvents)
			.values({ eventId })
			.onConflictDoNothing()
			.returning({ eventId: processedEvents.eventId });
		if (claimed.length === 0) return null;
		return work(executor);
	});
}
