import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from './index';
import type { DbExecutor } from './queries';
import { deleteTransaction, updateTransaction } from './queries';
import { updateBill } from './bills';
import { adminAuditLogs, billPayments, bills, creditInstallments, monthlyCategoryBudgets, monthlyPlans, transactions, users } from './schema';

type Actor = { userId: number; lineUserId: string };

function txSnapshot(row: typeof transactions.$inferSelect) {
	return {
		kind: row.kind, amount: row.amount, categoryId: row.categoryId, note: row.note,
		occurredAt: row.occurredAt, paymentMethod: row.paymentMethod, creditCardId: row.creditCardId, billId: row.billId
	};
}

function billSnapshot(row: typeof bills.$inferSelect) {
	return {
		name: row.name, amount: row.amount, categoryId: row.categoryId, paymentMethod: row.paymentMethod,
		recurrence: row.recurrence, dueDay: row.dueDay, dueDate: row.dueDate, active: row.active
	};
}

function installmentSnapshot(row: typeof creditInstallments.$inferSelect | undefined) {
	return row ? {
		name: row.name, categoryId: row.categoryId, totalAmount: row.totalAmount,
		installmentAmount: row.installmentAmount, totalInstallments: row.totalInstallments,
		firstDueDate: row.firstDueDate, active: row.active
	} : null;
}

async function audit(
	executor: DbExecutor,
	actor: Actor,
	targetUserId: number,
	entry: { action: string; entity: string; entityId: string; before: unknown; after: unknown }
) {
	await executor.insert(adminAuditLogs).values({
		actorUserId: actor.userId,
		actorLineUserId: actor.lineUserId,
		targetUserId,
		action: entry.action,
		entity: entry.entity,
		entityId: entry.entityId,
		changes: { before: entry.before, after: entry.after }
	});
}

export async function getAdminMemberDetail(targetUserId: number) {
	const [member] = await db.select({
		id: users.id, lineUserId: users.lineUserId, displayName: users.displayName, active: users.active,
		memberNote: users.memberNote, joinedAt: users.createdAt, lastActivityAt: users.lastActivityAt
	}).from(users).where(eq(users.id, targetUserId)).limit(1);
	if (!member) return null;
	const [items, memberBills, plans, categoryBudgets, logs] = await Promise.all([
		db.select({
			id: transactions.id, kind: transactions.kind, amount: transactions.amount,
			categoryId: transactions.categoryId, note: transactions.note, occurredAt: transactions.occurredAt,
			paymentMethod: transactions.paymentMethod, creditCardId: transactions.creditCardId
		}).from(transactions).where(eq(transactions.userId, targetUserId)).orderBy(desc(transactions.occurredAt), desc(transactions.id)).limit(200),
		db.select().from(bills).where(eq(bills.userId, targetUserId)).orderBy(desc(bills.createdAt)).limit(200),
		db.select().from(monthlyPlans).where(eq(monthlyPlans.userId, targetUserId)).orderBy(desc(monthlyPlans.month)).limit(24),
		db.select().from(monthlyCategoryBudgets).where(eq(monthlyCategoryBudgets.userId, targetUserId)).orderBy(desc(monthlyCategoryBudgets.month), monthlyCategoryBudgets.categoryId).limit(240),
		db.select().from(adminAuditLogs).where(eq(adminAuditLogs.targetUserId, targetUserId)).orderBy(desc(adminAuditLogs.createdAt)).limit(100)
	]);
	return { member, transactions: items, bills: memberBills, plans, categoryBudgets, auditLogs: logs };
}

export async function saveMemberNote(actor: Actor, targetUserId: number, note: string) {
	return db.transaction(async (executor) => {
		const [before] = await executor.select({ memberNote: users.memberNote }).from(users).where(eq(users.id, targetUserId)).limit(1);
		if (!before) return false;
		if (before.memberNote === note) return true;
		await executor.update(users).set({ memberNote: note, updatedAt: new Date() }).where(eq(users.id, targetUserId));
		await audit(executor, actor, targetUserId, { action: 'update', entity: 'member_note', entityId: String(targetUserId), before: before.memberNote, after: note });
		return true;
	});
}

export async function setMemberActive(actor: Actor, targetUserId: number, active: boolean) {
	return db.transaction(async (executor) => {
		const [before] = await executor.select().from(users).where(eq(users.id, targetUserId)).limit(1);
		if (!before) return null;
		if (before.active === active) return before;
		const [after] = await executor.update(users).set({ active, updatedAt: new Date(), ...(active ? { lastActivityAt: new Date() } : {}) })
			.where(eq(users.id, targetUserId)).returning();
		await audit(executor, actor, targetUserId, {
			action: active ? 'enable' : 'disable', entity: 'member', entityId: String(targetUserId),
			before: { active: before.active, lastActivityAt: before.lastActivityAt }, after: { active, lastActivityAt: after.lastActivityAt }
		});
		return after ?? null;
	});
}

export async function updateMemberTransaction(actor: Actor, targetUserId: number, transactionId: number, values: Parameters<typeof updateTransaction>[2]) {
	return db.transaction(async (executor) => {
		const [before] = await executor.select().from(transactions).where(and(eq(transactions.id, transactionId), eq(transactions.userId, targetUserId))).limit(1);
		if (!before) return null;
		const [plan] = await executor.select().from(creditInstallments).where(and(eq(creditInstallments.userId, targetUserId), eq(creditInstallments.purchaseTransactionId, transactionId))).limit(1);
		const relatedFilter = or(eq(bills.sourceTransactionId, transactionId), plan ? eq(bills.creditInstallmentId, plan.id) : undefined);
		const relatedBefore = relatedFilter ? await executor.select().from(bills).where(and(eq(bills.userId, targetUserId), relatedFilter)) : [];
		const paymentsBefore = await executor.select().from(billPayments).where(and(eq(billPayments.userId, targetUserId), eq(billPayments.transactionId, transactionId)));
		const after = await updateTransaction(transactionId, targetUserId, values, executor);
		if (after) {
			const relatedAfter = relatedFilter ? await executor.select().from(bills).where(and(eq(bills.userId, targetUserId), relatedFilter)) : [];
			const [planAfter] = plan ? await executor.select().from(creditInstallments).where(eq(creditInstallments.id, plan.id)).limit(1) : [];
			await audit(executor, actor, targetUserId, {
				action: 'update', entity: 'transaction', entityId: String(transactionId),
				before: { transaction: txSnapshot(before), installment: installmentSnapshot(plan), relatedBills: relatedBefore.map(billSnapshot), billPayments: paymentsBefore },
				after: { transaction: txSnapshot(after), installment: installmentSnapshot(planAfter), relatedBills: relatedAfter.map(billSnapshot), billPayments: paymentsBefore }
			});
		}
		return after;
	});
}

export async function deleteMemberTransaction(actor: Actor, targetUserId: number, transactionId: number) {
	return db.transaction(async (executor) => {
		const [before] = await executor.select().from(transactions).where(and(eq(transactions.id, transactionId), eq(transactions.userId, targetUserId))).limit(1);
		if (!before) return false;
		const [plan] = await executor.select().from(creditInstallments).where(and(eq(creditInstallments.userId, targetUserId), eq(creditInstallments.purchaseTransactionId, transactionId))).limit(1);
		const relatedFilter = or(eq(bills.sourceTransactionId, transactionId), plan ? eq(bills.creditInstallmentId, plan.id) : undefined);
		const relatedBefore = relatedFilter ? await executor.select().from(bills).where(and(eq(bills.userId, targetUserId), relatedFilter)) : [];
		const paymentsBefore = await executor.select().from(billPayments).where(and(eq(billPayments.userId, targetUserId), eq(billPayments.transactionId, transactionId)));
		if (!await deleteTransaction(transactionId, targetUserId, executor)) return false;
		const paymentsAfter = paymentsBefore.length ? await executor.select().from(billPayments).where(and(
			eq(billPayments.userId, targetUserId), inArray(billPayments.id, paymentsBefore.map((payment) => payment.id))
		)) : [];
		await audit(executor, actor, targetUserId, {
			action: 'delete', entity: 'transaction', entityId: String(transactionId),
			before: { transaction: txSnapshot(before), installment: installmentSnapshot(plan), relatedBills: relatedBefore.map(billSnapshot), billPayments: paymentsBefore },
			after: { transaction: null, installment: null, relatedBills: [], billPayments: paymentsAfter }
		});
		return true;
	});
}

export async function updateMemberBill(
	actor: Actor, targetUserId: number, billId: number,
	values: Partial<Omit<typeof bills.$inferInsert, 'id' | 'userId' | 'createdAt' | 'sourceTransactionId'>>
) {
	return db.transaction(async (executor) => {
		const [before] = await executor.select().from(bills).where(and(eq(bills.id, billId), eq(bills.userId, targetUserId))).limit(1);
		if (!before) return null;
		const linkedBefore = await executor.select().from(transactions).where(and(eq(transactions.billId, billId), eq(transactions.userId, targetUserId)));
		const paymentsBefore = await executor.select().from(billPayments).where(and(eq(billPayments.billId, billId), eq(billPayments.userId, targetUserId)));
		const after = await updateBill(billId, targetUserId, values, executor);
		if (after) {
			const linkedAfter = await executor.select().from(transactions).where(and(eq(transactions.billId, billId), eq(transactions.userId, targetUserId)));
			const paymentsAfter = await executor.select().from(billPayments).where(and(eq(billPayments.billId, billId), eq(billPayments.userId, targetUserId)));
			await audit(executor, actor, targetUserId, {
				action: 'update', entity: 'bill', entityId: String(billId),
				before: { bill: billSnapshot(before), linkedTransactions: linkedBefore.map(txSnapshot), billPayments: paymentsBefore },
				after: { bill: billSnapshot(after), linkedTransactions: linkedAfter.map(txSnapshot), billPayments: paymentsAfter }
			});
		}
		return after;
	});
}

export async function deleteMemberBill(actor: Actor, targetUserId: number, billId: number) {
	return db.transaction(async (executor) => {
		const [before] = await executor.select().from(bills).where(and(eq(bills.id, billId), eq(bills.userId, targetUserId))).limit(1);
		if (!before) return false;
		const linkedBefore = await executor.select().from(transactions).where(and(eq(transactions.billId, billId), eq(transactions.userId, targetUserId)));
		const paymentsBefore = await executor.select().from(billPayments).where(and(eq(billPayments.billId, billId), eq(billPayments.userId, targetUserId)));
		const deleted = await executor.delete(bills).where(and(eq(bills.id, billId), eq(bills.userId, targetUserId))).returning({ id: bills.id });
		if (!deleted.length) return false;
		const linkedAfter = linkedBefore.length ? await executor.select().from(transactions).where(and(
			eq(transactions.userId, targetUserId), inArray(transactions.id, linkedBefore.map((row) => row.id))
		)) : [];
		await audit(executor, actor, targetUserId, {
			action: 'delete', entity: 'bill', entityId: String(billId),
			before: { bill: billSnapshot(before), linkedTransactions: linkedBefore.map(txSnapshot), billPayments: paymentsBefore },
			after: { bill: null, linkedTransactions: linkedAfter.map(txSnapshot), billPayments: [] }
		});
		return true;
	});
}

export type AdminPlanValues = Pick<typeof monthlyPlans.$inferInsert,
	'month' | 'expectedIncome' | 'expectedIncomeDay' | 'savingsGoal' | 'foodDailyBudget' | 'commuteDailyBudget' | 'commuteDays' | 'budgetAlertsEnabled'>;

export async function saveMemberPlan(actor: Actor, targetUserId: number, values: AdminPlanValues) {
	return db.transaction(async (executor) => {
		const [before] = await executor.select().from(monthlyPlans).where(and(eq(monthlyPlans.userId, targetUserId), eq(monthlyPlans.month, values.month))).limit(1);
		const [after] = await executor.insert(monthlyPlans).values({ ...values, userId: targetUserId, updatedAt: new Date() })
			.onConflictDoUpdate({ target: [monthlyPlans.userId, monthlyPlans.month], set: {
				expectedIncome: values.expectedIncome, expectedIncomeDay: values.expectedIncomeDay, savingsGoal: values.savingsGoal,
				foodDailyBudget: values.foodDailyBudget, commuteDailyBudget: values.commuteDailyBudget,
				commuteDays: values.commuteDays, budgetAlertsEnabled: values.budgetAlertsEnabled, updatedAt: new Date()
			} }).returning();
		await audit(executor, actor, targetUserId, {
			action: before ? 'update' : 'create', entity: 'monthly_plan', entityId: values.month,
			before: before ?? null,
			after: { month: after.month, expectedIncome: after.expectedIncome, expectedIncomeDay: after.expectedIncomeDay, savingsGoal: after.savingsGoal, foodDailyBudget: after.foodDailyBudget, commuteDailyBudget: after.commuteDailyBudget, commuteDays: after.commuteDays, budgetAlertsEnabled: after.budgetAlertsEnabled }
		});
		return after;
	});
}

export async function saveMemberCategoryBudget(actor: Actor, targetUserId: number, values: { month: string; categoryId: string; amount: string }) {
	return db.transaction(async (executor) => {
		const [before] = await executor.select().from(monthlyCategoryBudgets).where(and(
			eq(monthlyCategoryBudgets.userId, targetUserId),
			eq(monthlyCategoryBudgets.month, values.month),
			eq(monthlyCategoryBudgets.categoryId, values.categoryId)
		)).limit(1);
		const [after] = await executor.insert(monthlyCategoryBudgets).values({ ...values, userId: targetUserId, updatedAt: new Date() })
			.onConflictDoUpdate({ target: [monthlyCategoryBudgets.userId, monthlyCategoryBudgets.month, monthlyCategoryBudgets.categoryId], set: { amount: values.amount, updatedAt: new Date() } })
			.returning();
		await audit(executor, actor, targetUserId, { action: before ? 'update' : 'create', entity: 'category_budget', entityId: `${values.month}:${values.categoryId}`, before: before ?? null, after });
		return after;
	});
}

export async function deleteMemberCategoryBudget(actor: Actor, targetUserId: number, month: string, categoryId: string) {
	return db.transaction(async (executor) => {
		const where = and(eq(monthlyCategoryBudgets.userId, targetUserId), eq(monthlyCategoryBudgets.month, month), eq(monthlyCategoryBudgets.categoryId, categoryId));
		const [before] = await executor.select().from(monthlyCategoryBudgets).where(where).limit(1);
		if (!before) return false;
		await executor.delete(monthlyCategoryBudgets).where(where);
		await audit(executor, actor, targetUserId, { action: 'delete', entity: 'category_budget', entityId: `${month}:${categoryId}`, before, after: null });
		return true;
	});
}
