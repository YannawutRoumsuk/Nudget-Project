import { and, asc, eq } from 'drizzle-orm';
import { billDueDate, billPeriod } from '$lib/bills';
import { bangkokMonthKey } from '$lib/utils/date';
import { toNumber } from '$lib/utils/money';
import { db } from './index';
import { billPayments, bills, transactions } from './schema';
import type { Bill, PaymentMethod } from './schema';
import type { DbExecutor } from './queries';

export interface BillView {
	id: number;
	name: string;
	amount: number;
	categoryId: string;
	paymentMethod: PaymentMethod;
	recurrence: 'monthly' | 'once';
	dueDay: number | null;
	dueDate: Date | null;
	active: boolean;
	period: string;
	paid: boolean;
	transactionId: number | null;
}

function toBillView(bill: Bill, reference: Date, paid?: { transactionId: number | null }): BillView {
	return {
		...bill,
		amount: toNumber(bill.amount),
		period: billPeriod(bill, reference),
		paid: Boolean(paid),
		transactionId: paid?.transactionId ?? null
	};
}

export async function listBills(userId: number, reference = new Date(), includeInactive = false): Promise<BillView[]> {
	const owned = includeInactive ? eq(bills.userId, userId) : and(eq(bills.userId, userId), eq(bills.active, true));
	const rows = await db.select().from(bills).where(owned).orderBy(asc(bills.dueDay), asc(bills.id));
	const payments = await db.select().from(billPayments).where(eq(billPayments.userId, userId));
	const paidByKey = new Map(payments.map((payment) => [`${payment.billId}:${payment.period}`, payment]));
	return rows.map((bill) => toBillView(bill, reference, paidByKey.get(`${bill.id}:${billPeriod(bill, reference)}`)));
}

export async function getBill(id: number, userId: number): Promise<Bill | null> {
	const [row] = await db.select().from(bills).where(and(eq(bills.id, id), eq(bills.userId, userId))).limit(1);
	return row ?? null;
}

export async function createBill(values: typeof bills.$inferInsert, executor: DbExecutor = db): Promise<Bill> {
	const [row] = await executor.insert(bills).values(values).returning();
	return row;
}

export async function updateBill(
	id: number,
	userId: number,
	values: Partial<Omit<typeof bills.$inferInsert, 'id' | 'userId' | 'createdAt'>>
): Promise<Bill | null> {
	return db.transaction(async (executor) => {
		const [row] = await executor
			.update(bills)
			.set({ ...values, updatedAt: new Date() })
			.where(and(eq(bills.id, id), eq(bills.userId, userId)))
			.returning();
		if (!row) return null;
		const period = billPeriod(row, new Date());
		const [payment] = await executor.select().from(billPayments)
			.where(and(eq(billPayments.billId, id), eq(billPayments.period, period))).limit(1);
		if (payment?.transactionId) {
			await executor.update(transactions).set({
				amount: row.amount, categoryId: row.categoryId, note: row.name,
				paymentMethod: row.paymentMethod
			}).where(eq(transactions.id, payment.transactionId));
		}
		return row;
	});
}

export async function markBillPaid(id: number, userId: number, reference = new Date()): Promise<{ bill: Bill; transactionId: number; existed: boolean } | null> {
	return db.transaction(async (executor) => {
		const [bill] = await executor.select().from(bills).where(and(eq(bills.id, id), eq(bills.userId, userId))).limit(1);
		if (!bill) return null;
		const period = billPeriod(bill, reference);
		const [existing] = await executor
			.select()
			.from(billPayments)
			.where(and(eq(billPayments.billId, id), eq(billPayments.period, period)));
		if (existing?.transactionId) {
			return { bill, transactionId: existing.transactionId, existed: true };
		}
		const [transaction] = await executor.insert(transactions).values({
			userId: bill.userId,
			kind: 'expense',
			amount: bill.amount,
			categoryId: bill.categoryId,
			note: bill.name,
			occurredAt: reference,
			paymentMethod: bill.paymentMethod,
			billId: bill.id,
			source: 'web',
			parsedBy: 'manual',
			rawText: `[bill:${bill.id}:${period}]`
		}).returning({ id: transactions.id });
		if (existing) {
			await executor.update(billPayments).set({ transactionId: transaction.id, paidAt: reference }).where(eq(billPayments.id, existing.id));
		} else {
			await executor.insert(billPayments).values({ userId: bill.userId, billId: bill.id, period, transactionId: transaction.id });
		}
		return { bill, transactionId: transaction.id, existed: false };
	});
}

export async function unmarkBillPaid(id: number, userId: number, reference = new Date()): Promise<boolean> {
	return db.transaction(async (executor) => {
		const [bill] = await executor.select().from(bills).where(and(eq(bills.id, id), eq(bills.userId, userId))).limit(1);
		if (!bill) return false;
		const period = billPeriod(bill, reference);
		const [payment] = await executor
			.delete(billPayments)
			.where(and(eq(billPayments.billId, id), eq(billPayments.period, period)))
			.returning();
		if (!payment) return false;
		if (payment.transactionId) {
			await executor.delete(transactions).where(eq(transactions.id, payment.transactionId));
		}
		return true;
	});
}

export async function getUnpaidBillTotal(userId: number, reference = new Date()): Promise<number> {
	const rows = await listBills(userId, reference);
	const month = bangkokMonthKey(reference);
	return rows.filter((bill) => {
		const due = billDueDate(bill, reference);
		return !bill.paid && due && bangkokMonthKey(due) === month;
	}).reduce((sum, bill) => sum + bill.amount, 0);
}
