import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { categoryLabel } from '$lib/categories';
import {
	EXPORT_TIMEZONE,
	exportMonthKeys,
	formatBangkokDateTime,
	moneyTotals,
	type ExportSelection,
	type PersonalExport
} from '$lib/export';
import { bangkokDayKey } from '$lib/utils/date';
import { db } from './index';
import { billPayments, bills, monthlyPlans, transactions, users } from './schema';

export async function getPersonalExport(userId: number, selection: ExportSelection, now = new Date()): Promise<PersonalExport> {
	const months = exportMonthKeys(selection);
	const [accountRows, transactionRows, billRows, paymentRows, planRows] = await Promise.all([
		db.select({ displayName: users.displayName, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1),
		db.select().from(transactions)
			.where(and(eq(transactions.userId, userId), gte(transactions.occurredAt, selection.from), lt(transactions.occurredAt, selection.to)))
			.orderBy(asc(transactions.occurredAt), asc(transactions.id)),
		db.select().from(bills).where(eq(bills.userId, userId)).orderBy(asc(bills.id)),
		db.select().from(billPayments)
			.where(and(eq(billPayments.userId, userId), gte(billPayments.paidAt, selection.from), lt(billPayments.paidAt, selection.to)))
			.orderBy(asc(billPayments.paidAt), asc(billPayments.id)),
		db.select().from(monthlyPlans)
			.where(and(eq(monthlyPlans.userId, userId), inArray(monthlyPlans.month, months)))
			.orderBy(asc(monthlyPlans.month))
	]);

	const exportedTransactions = transactionRows.map((row) => ({
		id: row.id,
		kind: row.kind,
		amount: row.amount,
		categoryId: row.categoryId,
		categoryNameTh: categoryLabel(row.categoryId),
		note: row.note,
		occurredAt: formatBangkokDateTime(row.occurredAt),
		paymentMethod: row.paymentMethod,
		billId: row.billId,
		source: row.source,
		parsedBy: row.parsedBy,
		createdAt: formatBangkokDateTime(row.createdAt)
	}));
	const totals = moneyTotals(exportedTransactions);
	const account = accountRows[0];

	return {
		schemaVersion: 1,
		generatedAt: formatBangkokDateTime(now),
		timezone: EXPORT_TIMEZONE,
		selection: { from: selection.fromKey, to: selection.toKey },
		scope: {
			transactions: 'selected_range',
			billPayments: 'selected_range',
			monthlyPlans: 'overlapping_months',
			bills: 'all_saved'
		},
		account: account ? { displayName: account.displayName, createdAt: formatBangkokDateTime(account.createdAt) } : null,
		totals: { ...totals, transactionCount: exportedTransactions.length, billCount: billRows.length },
		transactions: exportedTransactions,
		bills: billRows.map((row) => ({
			id: row.id,
			name: row.name,
			amount: row.amount,
			categoryId: row.categoryId,
			categoryNameTh: categoryLabel(row.categoryId),
			paymentMethod: row.paymentMethod,
			recurrence: row.recurrence,
			dueDay: row.dueDay,
			dueDate: row.dueDate ? bangkokDayKey(row.dueDate) : null,
			active: row.active,
			createdAt: formatBangkokDateTime(row.createdAt),
			updatedAt: formatBangkokDateTime(row.updatedAt)
		})),
		billPayments: paymentRows.map((row) => ({
			id: row.id,
			billId: row.billId,
			period: row.period,
			transactionId: row.transactionId,
			paidAt: formatBangkokDateTime(row.paidAt)
		})),
		monthlyPlans: planRows.map((row) => ({
			month: row.month,
			expectedIncome: row.expectedIncome,
			savingsGoal: row.savingsGoal,
			foodDailyBudget: row.foodDailyBudget,
			commuteDailyBudget: row.commuteDailyBudget,
			commuteDays: row.commuteDays,
			updatedAt: formatBangkokDateTime(row.updatedAt)
		}))
	};
}
