import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { addMonths } from '$lib/utils/date';
import { currentCardCycle } from '$lib/credit-cards';
import { toNumber } from '$lib/utils/money';
import { db } from './index';
import { billPayments, bills, creditCards, creditInstallments, transactions } from './schema';
import type { CreditCard } from './schema';

export type CreditCardInput = Pick<CreditCard, 'name' | 'closingDay' | 'dueDay' | 'creditLimit' | 'isDefault'>;

export async function listCreditCards(userId: number): Promise<CreditCard[]> {
	return db.select().from(creditCards).where(eq(creditCards.userId, userId))
		.orderBy(asc(creditCards.active), asc(creditCards.name), asc(creditCards.id));
}

export async function getCreditCardCycleSpend(userId: number, card: CreditCard, reference = new Date()): Promise<number> {
	const range = currentCardCycle(reference, card);
	const [row] = await db.select({ total: sql<string>`coalesce(sum(${transactions.amount}), 0)` }).from(transactions)
		.where(and(
			eq(transactions.userId, userId),
			eq(transactions.creditCardId, card.id),
			eq(transactions.kind, 'expense'),
			gte(transactions.occurredAt, range.from),
			lt(transactions.occurredAt, range.to)
		));
	return toNumber(row?.total ?? 0);
}

export async function getCreditCard(id: number, userId: number): Promise<CreditCard | null> {
	const [row] = await db.select().from(creditCards).where(and(eq(creditCards.id, id), eq(creditCards.userId, userId))).limit(1);
	return row ?? null;
}

export async function getDefaultCreditCardId(userId: number, executor: Pick<typeof db, 'select'> = db): Promise<number | null> {
	const [card] = await executor.select({ id: creditCards.id }).from(creditCards)
		.where(and(eq(creditCards.userId, userId), eq(creditCards.active, true), eq(creditCards.isDefault, true))).limit(1);
	return card?.id ?? null;
}

export async function saveCreditCard(userId: number, input: CreditCardInput, id?: number): Promise<CreditCard | null> {
	return db.transaction(async (executor) => {
		const [existing] = id
			? await executor.select().from(creditCards).where(and(eq(creditCards.id, id), eq(creditCards.userId, userId))).limit(1)
			: [];
		if (id && !existing) return null;
		const isDefault = input.isDefault || !(await getDefaultCreditCardId(userId, executor));
		if (isDefault) await executor.update(creditCards).set({ isDefault: false, updatedAt: new Date() }).where(eq(creditCards.userId, userId));
		if (existing) {
			const [updated] = await executor.update(creditCards).set({ ...input, isDefault, active: true, updatedAt: new Date() })
				.where(and(eq(creditCards.id, id!), eq(creditCards.userId, userId))).returning();
			return updated ?? null;
		}
		const [created] = await executor.insert(creditCards).values({ ...input, isDefault, userId }).returning();
		return created ?? null;
	});
}

export async function setCreditCardActive(id: number, userId: number, active: boolean): Promise<boolean> {
	return db.transaction(async (executor) => {
		const [card] = await executor.select().from(creditCards)
			.where(and(eq(creditCards.id, id), eq(creditCards.userId, userId))).limit(1);
		if (!card) return false;
		await executor.update(creditCards).set({ active, isDefault: active ? card.isDefault : false, updatedAt: new Date() })
			.where(and(eq(creditCards.id, id), eq(creditCards.userId, userId)));
		if (!active && card.isDefault) {
			const [next] = await executor.select({ id: creditCards.id }).from(creditCards)
				.where(and(eq(creditCards.userId, userId), eq(creditCards.active, true))).orderBy(asc(creditCards.id)).limit(1);
			if (next) await executor.update(creditCards).set({ isDefault: true, updatedAt: new Date() })
				.where(and(eq(creditCards.id, next.id), eq(creditCards.userId, userId)));
		}
		return true;
	});
}

export interface CreditInstallmentProgress {
	id: number;
	creditCardId: number;
	name: string;
	totalAmount: number;
	installmentAmount: number;
	totalInstallments: number;
	paidInstallments: number;
	remainingAmount: number;
	firstDueDate: Date;
	active: boolean;
}

export async function listCreditInstallments(userId: number): Promise<CreditInstallmentProgress[]> {
	const plans = await db.select().from(creditInstallments).where(eq(creditInstallments.userId, userId))
		.orderBy(asc(creditInstallments.firstDueDate), asc(creditInstallments.id));
	if (!plans.length) return [];
	const planIds = plans.map((plan) => plan.id);
	const rows = await db.select({ planId: bills.creditInstallmentId, amount: bills.amount, paid: billPayments.id })
		.from(bills).leftJoin(billPayments, and(eq(billPayments.billId, bills.id), eq(billPayments.userId, userId)))
		.where(and(eq(bills.userId, userId), inArray(bills.creditInstallmentId, planIds)));
	const paid = new Map<number, number>();
	const remaining = new Map<number, number>();
	for (const row of rows) {
		if (row.planId === null) continue;
		if (row.paid !== null) paid.set(row.planId, (paid.get(row.planId) ?? 0) + 1);
		else remaining.set(row.planId, (remaining.get(row.planId) ?? 0) + Number(row.amount));
	}
	return plans.map((plan) => ({
		id: plan.id,
		creditCardId: plan.creditCardId,
		name: plan.name,
		totalAmount: Number(plan.totalAmount),
		installmentAmount: Number(plan.installmentAmount),
		totalInstallments: plan.totalInstallments,
		paidInstallments: paid.get(plan.id) ?? 0,
		remainingAmount: remaining.get(plan.id) ?? 0,
		firstDueDate: plan.firstDueDate,
		active: plan.active
	}));
}

export interface NewCreditInstallmentPlan {
	userId: number;
	creditCardId: number;
	name: string;
	categoryId: string;
	totalAmount: number;
	purchaseDate: Date;
	firstDueDate: Date;
	installments: number[];
}

/** Record the purchase once and create future bills without counting settlements as new spending. */
export async function createCreditInstallmentPlan(input: NewCreditInstallmentPlan): Promise<number | null> {
	if (input.installments.length < 2 || input.installments.length > 60) return null;
	return db.transaction(async (executor) => {
		const [card] = await executor.select().from(creditCards).where(and(
			eq(creditCards.id, input.creditCardId), eq(creditCards.userId, input.userId), eq(creditCards.active, true)
		)).limit(1);
		if (!card) return null;
		const amount = input.installments.reduce((sum, item) => sum + item, 0);
		const [purchase] = await executor.insert(transactions).values({
			userId: input.userId,
			kind: 'expense',
			amount: amount.toFixed(2),
			categoryId: input.categoryId,
			note: input.name,
			occurredAt: input.purchaseDate,
			paymentMethod: 'credit_card',
			creditCardId: card.id,
			source: 'web',
			parsedBy: 'manual',
			rawText: '[credit-installment]'
		}).returning();
		const [plan] = await executor.insert(creditInstallments).values({
			userId: input.userId,
			creditCardId: card.id,
			purchaseTransactionId: purchase.id,
			name: input.name,
			categoryId: input.categoryId,
			totalAmount: amount.toFixed(2),
			installmentAmount: input.installments[0].toFixed(2),
			totalInstallments: input.installments.length,
			firstDueDate: input.firstDueDate
		}).returning();
		const dueDates = input.installments.map((_, index) => addMonths(input.firstDueDate, index));
		await executor.insert(bills).values(input.installments.map((billAmount, index) => ({
			userId: input.userId,
			name: `${input.name} (${index + 1}/${input.installments.length})`,
			amount: billAmount.toFixed(2),
			categoryId: input.categoryId,
			paymentMethod: 'bank' as const,
			recurrence: 'once' as const,
			dueDate: dueDates[index],
			creditCardId: card.id,
			noExpenseOnPay: true,
			creditInstallmentId: plan.id,
			installmentNumber: index + 1,
			active: true
		})));
		return plan.id;
	});
}
