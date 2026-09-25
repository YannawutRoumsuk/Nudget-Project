import { and, eq, sql } from 'drizzle-orm';
import type { RecurringCandidate } from '$lib/recurring';
import { db } from './index';
import { bills, creditCards, recurringDecisions } from './schema';
import type { PaymentMethod, RecurringDecisionStatus } from './schema';

export async function getRecurringDecisions(userId: number) {
	return db.select({ merchantKey: recurringDecisions.merchantKey, status: recurringDecisions.status,
		billId: recurringDecisions.billId, billName: bills.name, billAmount: bills.amount, billActive: bills.active })
		.from(recurringDecisions).leftJoin(bills, eq(bills.id, recurringDecisions.billId))
		.where(eq(recurringDecisions.userId, userId));
}

export async function decideRecurringCandidate(userId: number, merchantKey: string, status: 'dismissed' | 'not_recurring') {
	return db.transaction(async (tx) => {
		const [existing] = await tx.select({ id: recurringDecisions.id, status: recurringDecisions.status })
			.from(recurringDecisions).where(and(eq(recurringDecisions.userId, userId), eq(recurringDecisions.merchantKey, merchantKey))).limit(1);
		if (existing?.status === 'confirmed') return false;
		if (existing) {
			await tx.update(recurringDecisions).set({ status, billId: null, updatedAt: new Date() })
				.where(and(eq(recurringDecisions.id, existing.id), eq(recurringDecisions.userId, userId)));
			return true;
		}
		const inserted = await tx.insert(recurringDecisions).values({ userId, merchantKey, status })
			.onConflictDoNothing().returning({ id: recurringDecisions.id });
		return inserted.length > 0;
	});
}

export async function restoreRecurringCandidate(userId: number, merchantKey: string) {
	const deleted = await db.delete(recurringDecisions).where(and(eq(recurringDecisions.userId, userId),
		eq(recurringDecisions.merchantKey, merchantKey), sql`${recurringDecisions.status} <> 'confirmed'`)).returning({ id: recurringDecisions.id });
	return deleted.length > 0;
}

/** Confirming creates the bill and records the accepted decision in one transaction. */
export async function confirmRecurringCandidate(userId: number, candidate: RecurringCandidate) {
	return db.transaction(async (tx) => {
		const [existing] = await tx.select({ id: recurringDecisions.id, status: recurringDecisions.status })
			.from(recurringDecisions).where(and(eq(recurringDecisions.userId, userId), eq(recurringDecisions.merchantKey, candidate.merchantKey))).limit(1);
		if (existing?.status === 'confirmed') return null;
		let decisionId: number;
		if (existing) {
			const [updated] = await tx.update(recurringDecisions).set({ status: 'confirmed', billId: null, updatedAt: new Date() })
				.where(and(eq(recurringDecisions.id, existing.id), eq(recurringDecisions.userId, userId))).returning({ id: recurringDecisions.id });
			if (!updated) return null;
			decisionId = updated.id;
		} else {
			const [inserted] = await tx.insert(recurringDecisions).values({ userId, merchantKey: candidate.merchantKey, status: 'confirmed' })
				.onConflictDoNothing().returning({ id: recurringDecisions.id });
			if (!inserted) return null;
			decisionId = inserted.id;
		}

		let creditCardId: number | null = null;
		if (candidate.creditCardId !== null) {
			const [card] = await tx.select({ id: creditCards.id }).from(creditCards)
				.where(and(eq(creditCards.id, candidate.creditCardId), eq(creditCards.userId, userId), eq(creditCards.active, true))).limit(1);
			if (card) creditCardId = card.id;
		}
		const [bill] = await tx.insert(bills).values({
			userId, name: candidate.name, amount: candidate.amount.toFixed(2), categoryId: candidate.categoryId,
			paymentMethod: candidate.paymentMethod as PaymentMethod, recurrence: 'monthly', dueDay: candidate.dueDay,
			dueDate: null, creditCardId, sourceTransactionId: null, noExpenseOnPay: false, active: true
		}).returning();
		await tx.update(recurringDecisions).set({ billId: bill.id, updatedAt: new Date() })
			.where(and(eq(recurringDecisions.id, decisionId), eq(recurringDecisions.userId, userId)));
		return bill;
	});
}
