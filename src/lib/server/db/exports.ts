import { and, asc, eq, gte, inArray, lt, notExists } from 'drizzle-orm';
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
import { billPayments, bills, categories, monthlyPlans, recurringDecisions, savingsGoalContributions, savingsGoals, transactions, userCategoryRules, users, whatIfScenarios } from './schema';

export async function getPersonalExport(userId: number, selection: ExportSelection, now = new Date()): Promise<PersonalExport> {
	const months = exportMonthKeys(selection);
	const [accountRows, transactionRows, billRows, paymentRows, planRows, learnedRows, scenarioRows, goalRows, contributionRows, decisionRows] = await Promise.all([
		db.select({ displayName: users.displayName, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1),
		db.select().from(transactions)
			.where(and(
				eq(transactions.userId, userId),
				gte(transactions.occurredAt, selection.from),
				lt(transactions.occurredAt, selection.to),
				notExists(db.select({ id: bills.id }).from(bills).where(and(
					eq(bills.id, transactions.billId),
					eq(bills.noExpenseOnPay, true)
				)))
			))
			.orderBy(asc(transactions.occurredAt), asc(transactions.id)),
		db.select().from(bills).where(eq(bills.userId, userId)).orderBy(asc(bills.id)),
		db.select().from(billPayments)
			.where(and(eq(billPayments.userId, userId), gte(billPayments.paidAt, selection.from), lt(billPayments.paidAt, selection.to)))
			.orderBy(asc(billPayments.paidAt), asc(billPayments.id)),
		db.select().from(monthlyPlans)
			.where(and(eq(monthlyPlans.userId, userId), inArray(monthlyPlans.month, months)))
			.orderBy(asc(monthlyPlans.month)),
		db.select({ keyword: userCategoryRules.keyword, categoryId: userCategoryRules.categoryId, categoryNameTh: categories.nameTh,
			matchCount: userCategoryRules.matchCount, savedLlmCalls: userCategoryRules.savedLlmCalls, createdAt: userCategoryRules.createdAt, updatedAt: userCategoryRules.updatedAt })
			.from(userCategoryRules).innerJoin(categories, eq(categories.id, userCategoryRules.categoryId))
			.where(eq(userCategoryRules.userId, userId)).orderBy(asc(userCategoryRules.keyword)),
		db.select().from(whatIfScenarios).where(eq(whatIfScenarios.userId, userId)).orderBy(asc(whatIfScenarios.month), asc(whatIfScenarios.id)),
		db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId)).orderBy(asc(savingsGoals.priority), asc(savingsGoals.id)),
		db.select({ goalId: savingsGoalContributions.goalId, goalName: savingsGoals.name, amount: savingsGoalContributions.amount, createdAt: savingsGoalContributions.createdAt })
			.from(savingsGoalContributions).innerJoin(savingsGoals, eq(savingsGoals.id, savingsGoalContributions.goalId))
			.where(eq(savingsGoalContributions.userId, userId)).orderBy(asc(savingsGoalContributions.createdAt), asc(savingsGoalContributions.id)),
		db.select().from(recurringDecisions).where(eq(recurringDecisions.userId, userId)).orderBy(asc(recurringDecisions.merchantKey))
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
		schemaVersion: 6,
		generatedAt: formatBangkokDateTime(now),
		timezone: EXPORT_TIMEZONE,
		selection: { from: selection.fromKey, to: selection.toKey },
		scope: {
			transactions: 'selected_range',
			billPayments: 'selected_range',
			monthlyPlans: 'overlapping_months',
			learnedCategories: 'all_saved',
			whatIfScenarios: 'all_saved',
			savingsGoals: 'all_saved',
			savingsGoalContributions: 'all_saved',
			recurringDecisions: 'all_saved',
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
			expectedIncomeDay: row.expectedIncomeDay,
			savingsGoal: row.savingsGoal,
			foodDailyBudget: row.foodDailyBudget,
			commuteDailyBudget: row.commuteDailyBudget,
			commuteDays: row.commuteDays,
			updatedAt: formatBangkokDateTime(row.updatedAt)
		})),
		learnedCategories: learnedRows.map((row) => ({
			keyword: row.keyword, categoryId: row.categoryId, categoryNameTh: row.categoryNameTh,
			matchCount: row.matchCount, savedLlmCalls: row.savedLlmCalls,
			createdAt: formatBangkokDateTime(row.createdAt), updatedAt: formatBangkokDateTime(row.updatedAt)
		})),
		whatIfScenarios: scenarioRows.map((row) => ({ month: row.month, name: row.name, changes: row.changes,
			createdAt: formatBangkokDateTime(row.createdAt), updatedAt: formatBangkokDateTime(row.updatedAt) })),
		savingsGoals: goalRows.map((row) => ({ id: row.id, name: row.name, goalType: row.goalType, targetAmount: row.targetAmount,
			currentAmount: row.currentAmount, targetDate: row.targetDate ? bangkokDayKey(row.targetDate) : null,
			monthlyContribution: row.monthlyContribution, priority: row.priority, status: row.status,
			createdAt: formatBangkokDateTime(row.createdAt), updatedAt: formatBangkokDateTime(row.updatedAt) })),
		savingsGoalContributions: contributionRows.map((row) => ({ goalId: row.goalId, goalName: row.goalName,
			amount: row.amount, createdAt: formatBangkokDateTime(row.createdAt) })),
		recurringDecisions: decisionRows.map((row) => ({ merchantKey: row.merchantKey, status: row.status,
			billId: row.billId, updatedAt: formatBangkokDateTime(row.updatedAt) }))
	};
}
