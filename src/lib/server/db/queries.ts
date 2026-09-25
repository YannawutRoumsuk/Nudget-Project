import { and, desc, eq, gte, inArray, lt, not, notExists, notInArray, or, sql } from 'drizzle-orm';
import { FIXED_EXPENSE_CATEGORY_IDS } from '$lib/categories';
import { deferredBillForTransaction } from '$lib/deferred';
import { rememberCategoryFromEdit } from './learned-categories';
import { db } from './index';
import { bills, creditCards, creditInstallments, processedEvents, reminderDeliveries, transactions } from './schema';
import type { NewTransaction, PaymentMethod, Transaction, TxKind } from './schema';
import { toNumber } from '$lib/utils/money';
import { getDefaultCreditCardId } from './credit-cards';
import { splitInstallments } from '$lib/credit-cards';

export type DbExecutor = Pick<typeof db, 'insert' | 'select' | 'update' | 'delete'>;

export async function claimReminderDelivery(key: string, userId: number, executor: DbExecutor = db): Promise<boolean> {
	const rows = await executor.insert(reminderDeliveries).values({ key, userId }).onConflictDoNothing().returning({ key: reminderDeliveries.key });
	return rows.length > 0;
}

export async function releaseReminderDelivery(key: string, executor: DbExecutor = db): Promise<void> {
	await executor.delete(reminderDeliveries).where(eq(reminderDeliveries.key, key));
}

export async function hasReminderDelivery(key: string, userId: number, executor: DbExecutor = db): Promise<boolean> {
	const [row] = await executor.select({ key: reminderDeliveries.key }).from(reminderDeliveries)
		.where(and(eq(reminderDeliveries.key, key), eq(reminderDeliveries.userId, userId))).limit(1);
	return Boolean(row);
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

export interface FinanceQueryAggregate {
	from: Date;
	to: Date;
	kind: TxKind | 'both';
	categoryIds: string[];
	paymentMethod: PaymentMethod | null;
	groupBy: 'none' | 'category' | 'paymentMethod';
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

/**
 * The owner filter belongs in the same helper as the date window so that adding
 * a new aggregate cannot accidentally read across tenants.
 */
function ownedInRange(userId: number, { from, to }: Range, excludeMarked = false) {
	return and(
		eq(transactions.userId, userId),
		gte(transactions.occurredAt, from),
		lt(transactions.occurredAt, to),
		notExists(db.select({ id: bills.id }).from(bills).where(and(
			eq(bills.id, transactions.billId),
			eq(bills.noExpenseOnPay, true)
		))),
		excludeMarked ? eq(transactions.excludeFromBaseline, false) : undefined
	);
}

export async function insertTransaction(tx: NewTransaction, executor?: DbExecutor): Promise<Transaction> {
	if (!executor) return db.transaction((inner) => insertTransaction(tx, inner));
	const creditCardId = tx.paymentMethod === 'credit_card'
		? tx.creditCardId ?? await getDefaultCreditCardId(tx.userId, executor)
		: null;
	if (creditCardId !== null) await assertOwnedActiveCard(tx.userId, creditCardId, executor);
	const [row] = await executor.insert(transactions).values({ ...tx, creditCardId }).returning();
	await syncDeferredBill(row, executor);
	return row;
}

/**
 * The unique user/fingerprint index owns the race: two concurrent webhook
 * events may both reach this call, but only one can create a ledger row.
 */
export async function insertTransactionIfUnique(
	tx: NewTransaction & { fingerprint: string },
	executor?: DbExecutor
): Promise<Transaction | null> {
	if (!executor) return db.transaction((inner) => insertTransactionIfUnique(tx, inner));
	const creditCardId = tx.paymentMethod === 'credit_card'
		? tx.creditCardId ?? await getDefaultCreditCardId(tx.userId, executor)
		: null;
	if (creditCardId !== null) await assertOwnedActiveCard(tx.userId, creditCardId, executor);
	const [row] = await executor
		.insert(transactions)
		.values({ ...tx, creditCardId })
		.onConflictDoNothing()
		.returning();
	if (row) await syncDeferredBill(row, executor);
	return row ?? null;
}

export async function deleteTransaction(id: number, userId: number, executor?: DbExecutor): Promise<boolean> {
	if (!executor) return db.transaction((inner) => deleteTransaction(id, userId, inner));
	const [plan] = await executor.select({ id: creditInstallments.id }).from(creditInstallments)
		.where(and(eq(creditInstallments.userId, userId), eq(creditInstallments.purchaseTransactionId, id))).limit(1);
	if (plan) await executor.delete(bills).where(and(eq(bills.userId, userId), eq(bills.creditInstallmentId, plan.id)));
	await executor.delete(bills).where(and(eq(bills.userId, userId), eq(bills.sourceTransactionId, id)));
	const deleted = await executor
		.delete(transactions)
		.where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
		.returning({ id: transactions.id });
	return deleted.length > 0;
}

export async function getTransaction(id: number, userId: number): Promise<Transaction | null> {
	const [row] = await db
		.select()
		.from(transactions)
		.where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
		.limit(1);
	return row ?? null;
}

export async function updateTransaction(
	id: number,
	userId: number,
	values: Partial<Pick<NewTransaction, 'kind' | 'amount' | 'categoryId' | 'note' | 'occurredAt' | 'paymentMethod' | 'creditCardId' | 'excludeFromBaseline' | 'anomalyDismissed'>>,
	transactionExecutor?: DbExecutor
): Promise<Transaction | null> {
	const update = async (executor: DbExecutor) => {
		const [existing] = await executor.select().from(transactions)
			.where(and(eq(transactions.id, id), eq(transactions.userId, userId))).limit(1);
		if (!existing) return null;
		const [plan] = await executor.select().from(creditInstallments).where(and(
			eq(creditInstallments.userId, userId), eq(creditInstallments.purchaseTransactionId, id)
		)).limit(1);
		const method = values.paymentMethod ?? existing.paymentMethod;
		const kind = values.kind ?? existing.kind;
		const creditCardId = method === 'credit_card'
			? values.creditCardId === undefined ? existing.creditCardId : values.creditCardId
			: null;
		if (creditCardId !== null) await assertOwnedActiveCard(userId, creditCardId, executor);
		const planAmounts = plan ? splitInstallments(Number(values.amount ?? existing.amount), plan.totalInstallments) : [];
		if (plan && (kind !== 'expense' || method !== 'credit_card' || creditCardId === null || !planAmounts.length)) return null;
		const [row] = await executor.update(transactions).set({ ...values, creditCardId })
			.where(and(eq(transactions.id, id), eq(transactions.userId, userId))).returning();
		if (row) {
			if (row.categoryId !== existing.categoryId) await rememberCategoryFromEdit(userId, row.categoryId, row.note, existing.rawText, executor);
			if (plan) {
				await executor.update(creditInstallments).set({
					creditCardId: row.creditCardId!,
					name: row.note,
					categoryId: row.categoryId,
					totalAmount: row.amount,
					installmentAmount: planAmounts[0].toFixed(2),
					updatedAt: new Date()
				}).where(and(eq(creditInstallments.id, plan.id), eq(creditInstallments.userId, userId)));
				const planBills = await executor.select({ id: bills.id, number: bills.installmentNumber }).from(bills).where(and(
					eq(bills.userId, userId), eq(bills.creditInstallmentId, plan.id)
				));
				for (const bill of planBills) {
					const index = (bill.number ?? 1) - 1;
					await executor.update(bills).set({
						name: `${row.note} (${index + 1}/${plan.totalInstallments})`,
						amount: planAmounts[index].toFixed(2),
						categoryId: row.categoryId,
						creditCardId: row.creditCardId,
						updatedAt: new Date()
					}).where(and(eq(bills.id, bill.id), eq(bills.userId, userId)));
				}
			} else await syncDeferredBill(row, executor);
		}
		return row ?? null;
	};
	return transactionExecutor ? update(transactionExecutor) : db.transaction(update);
}

async function syncDeferredBill(transaction: Transaction, executor: DbExecutor): Promise<void> {
	const [installment] = await executor.select({ id: creditInstallments.id }).from(creditInstallments)
		.where(and(eq(creditInstallments.userId, transaction.userId), eq(creditInstallments.purchaseTransactionId, transaction.id))).limit(1);
	if (installment) return;
	const [card] = transaction.creditCardId === null ? [] : await executor.select().from(creditCards)
		.where(and(eq(creditCards.id, transaction.creditCardId), eq(creditCards.userId, transaction.userId), eq(creditCards.active, true))).limit(1);
	const draft = deferredBillForTransaction(transaction, card ?? null);
	const [existing] = await executor.select().from(bills)
		.where(and(eq(bills.userId, transaction.userId), eq(bills.sourceTransactionId, transaction.id))).limit(1);
	if (!draft) {
		if (existing) await executor.delete(bills).where(eq(bills.id, existing.id));
		return;
	}
	if (existing) {
		await executor.update(bills).set({ ...draft, updatedAt: new Date() }).where(eq(bills.id, existing.id));
	} else {
		await executor.insert(bills).values(draft);
	}
}

async function assertOwnedActiveCard(userId: number, cardId: number, executor: DbExecutor): Promise<void> {
	const [card] = await executor.select({ id: creditCards.id }).from(creditCards).where(and(
		eq(creditCards.id, cardId), eq(creditCards.userId, userId), eq(creditCards.active, true)
	)).limit(1);
	if (!card) throw new Error('Credit card account does not belong to this user or is inactive');
}

export async function deleteLatestTransaction(userId: number, executor: DbExecutor = db): Promise<Transaction | null> {
	const [latest] = await executor
		.select()
		.from(transactions)
		.where(eq(transactions.userId, userId))
		.orderBy(desc(transactions.createdAt), desc(transactions.id))
		.limit(1);
	if (!latest) return null;
	await deleteTransaction(latest.id, userId, executor);
	return latest;
}

/**
 * Attaches detail to what was already recorded. Scoped to the latest entry on
 * purpose: in chat there is no way to point at an older one, and the row id is
 * never shown, so "the one I just sent" is the only target a person can mean.
 */
export async function updateLatestTransactionNote(
	userId: number,
	note: string,
	executor: DbExecutor = db
): Promise<Transaction | null> {
	const [latest] = await executor
		.select()
		.from(transactions)
		.where(eq(transactions.userId, userId))
		.orderBy(desc(transactions.createdAt), desc(transactions.id))
		.limit(1);
	if (!latest) return null;
	const [updated] = await executor
		.update(transactions)
		.set({ note })
		.where(and(eq(transactions.id, latest.id), eq(transactions.userId, userId)))
		.returning();
	if (updated) await syncDeferredBill(updated, executor);
	return updated ?? null;
}

export async function getTotals(userId: number, range: Range, executor: DbExecutor = db, excludeMarked = false): Promise<Totals> {
	const rows = await executor
		.select({
			kind: transactions.kind,
			total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
			count: sql<string>`count(*)`
		})
		.from(transactions)
		.where(ownedInRange(userId, range, excludeMarked))
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

export async function getPaymentMethodTotal(userId: number, range: Range, paymentMethod: PaymentMethod, executor: DbExecutor = db, excludeMarked = false): Promise<number> {
	const [row] = await executor.select({ total: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
		.from(transactions)
		.where(and(ownedInRange(userId, range, excludeMarked), eq(transactions.kind, 'expense'), eq(transactions.paymentMethod, paymentMethod)));
	return toNumber(row?.total ?? 0);
}

export async function getByCategory(userId: number, range: Range, kind: TxKind, executor: DbExecutor = db, excludeMarked = false): Promise<CategorySlice[]> {
	const rows = await executor
		.select({
			categoryId: transactions.categoryId,
			total: sql<string>`sum(${transactions.amount})`,
			count: sql<string>`count(*)`
		})
		.from(transactions)
		.where(and(ownedInRange(userId, range, excludeMarked), eq(transactions.kind, kind)))
		.groupBy(transactions.categoryId)
		.orderBy(desc(sql`sum(${transactions.amount})`));

	return rows.map((row) => ({
		categoryId: row.categoryId,
		total: toNumber(row.total),
		count: Number(row.count)
	}));
}

/** A fixed, owner-scoped aggregate used by the LINE natural-language query. */
export async function getFinanceQueryAggregate(userId: number, filter: FinanceQueryAggregate) {
	const where = and(
		ownedInRange(userId, { from: filter.from, to: filter.to }),
		filter.kind === 'both' ? undefined : eq(transactions.kind, filter.kind),
		filter.categoryIds.length ? inArray(transactions.categoryId, filter.categoryIds) : undefined,
		filter.paymentMethod ? eq(transactions.paymentMethod, filter.paymentMethod) : undefined
	);
	const rows = await db.select({
		kind: transactions.kind,
		categoryId: transactions.categoryId,
		paymentMethod: transactions.paymentMethod,
		total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
		count: sql<string>`count(*)`
	}).from(transactions).where(where).groupBy(transactions.kind, transactions.categoryId, transactions.paymentMethod);
	const totals: Totals = { income: 0, expense: 0, net: 0, count: 0 };
	const grouped = new Map<string, { amount: number; count: number }>();
	for (const row of rows) {
		const amount = toNumber(row.total);
		const count = Number(row.count);
		if (row.kind === 'income') totals.income += amount;
		else totals.expense += amount;
		totals.count += count;
		const groupKey = filter.groupBy === 'category' ? row.categoryId : filter.groupBy === 'paymentMethod' ? row.paymentMethod : '';
		if (groupKey) {
			const current = grouped.get(groupKey) ?? { amount: 0, count: 0 };
			current.amount += amount;
			current.count += count;
			grouped.set(groupKey, current);
		}
	}
	totals.net = totals.income - totals.expense;
	return {
		totals,
		breakdown: [...grouped].map(([key, value]) => ({ key, ...value })).sort((a, b) => b.amount - a.amount)
	};
}

export async function getDailySeries(userId: number, range: Range, options: { excludeFixed?: boolean } = {}): Promise<DayPoint[]> {
	const rows = await db
		.select({
			day: sql<string>`${BANGKOK_DAY}`,
			kind: transactions.kind,
			total: sql<string>`sum(${transactions.amount})`
		})
		.from(transactions)
		.where(and(ownedInRange(userId, range), options.excludeFixed ? notInArray(transactions.categoryId, [...FIXED_EXPENSE_CATEGORY_IDS]) : undefined))
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

/** Cashflow excludes deferred card/PayLater purchases; their money leaves on settlement instead. */
export async function getDailyCashflowSeries(userId: number, range: Range): Promise<DayPoint[]> {
	const rows = await db.select({ day: sql<string>`${BANGKOK_DAY}`, kind: transactions.kind, total: sql<string>`sum(${transactions.amount})` })
		.from(transactions)
		.where(and(
			ownedInRange(userId, range),
			or(not(eq(transactions.kind, 'expense')), notInArray(transactions.paymentMethod, ['credit_card', 'shopee_paylater']))
		))
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
	userId: number,
	range: Range,
	options: { limit?: number; kind?: TxKind; categoryId?: string; paymentMethod?: PaymentMethod; excludeMarked?: boolean } = {}
): Promise<Transaction[]> {
	const filters = [ownedInRange(userId, range, options.excludeMarked)];
	if (options.kind) filters.push(eq(transactions.kind, options.kind));
	if (options.categoryId) filters.push(eq(transactions.categoryId, options.categoryId));
	if (options.paymentMethod) filters.push(eq(transactions.paymentMethod, options.paymentMethod));

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

/** Claims a webhook before work that must run outside a database transaction. */
export async function claimEvent(eventId: string): Promise<boolean> {
	const rows = await db
		.insert(processedEvents)
		.values({ eventId })
		.onConflictDoNothing()
		.returning({ eventId: processedEvents.eventId });
	return rows.length > 0;
}
