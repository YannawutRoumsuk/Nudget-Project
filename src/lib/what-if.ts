import { analyzeBudget, analyzeCategoryBudgets } from '$lib/budget';
import type { BudgetAnalysis, BudgetInputs, CategoryBudgetInput, CategoryBudgetProgress } from '$lib/budget';
import type { TxKind } from '$lib/server/db/schema';
import { addDays, bangkokMonthKey } from '$lib/utils/date';

export type WhatIfChange =
	| { id: string; type: 'transaction'; kind: TxKind; amount: number; categoryId: string; note: string }
	| { id: string; type: 'savings'; amount: number }
	| { id: string; type: 'categoryBudget'; categoryId: string; amount: number }
	| { id: string; type: 'postponeBill'; billId: number; days: number };

export interface WhatIfBill {
	id: number;
	amount: number;
	categoryId: string;
	noExpenseOnPay: boolean;
	dueDate: Date;
}

export interface WhatIfInputs {
	budget: BudgetInputs;
	/** Month-close savings already carried into the baseline plan. */
	savingsCarryover?: number;
	categoryBudgets: CategoryBudgetInput[];
	bills: WhatIfBill[];
}

export interface WhatIfSnapshot {
	analysis: BudgetAnalysis;
	categories: CategoryBudgetProgress[];
	savingsRate: number;
	overBudget: string[];
}

export interface WhatIfResult {
	before: WhatIfSnapshot;
	after: WhatIfSnapshot;
	postponedBills: Array<{ billId: number; from: Date; to: Date }>;
}

/** Apply temporary edits, then use the same deterministic engines as the monthly plan page. */
export function calculateWhatIf(input: WhatIfInputs, changes: WhatIfChange[], currentDay: number, daysInMonth: number): WhatIfResult {
	const before = snapshot(input.budget, input.categoryBudgets, currentDay, daysInMonth);
	const budget = { ...input.budget };
	const categories = input.categoryBudgets.map((row) => ({ ...row }));
	const bills = input.bills.map((bill) => ({ ...bill }));
	const postponedBills: WhatIfResult['postponedBills'] = [];
	for (const change of changes) {
		if (change.type === 'transaction') {
			const category = categories.find((row) => row.categoryId === change.categoryId);
			if (change.kind === 'income') budget.expectedIncome += change.amount;
			else {
				budget.cashExpense = (budget.cashExpense ?? budget.expense) + change.amount;
				budget.expense += change.amount;
				if (category) category.spent += change.amount;
			}
		} else if (change.type === 'savings') budget.savingsGoal = change.amount + (input.savingsCarryover ?? 0);
		else if (change.type === 'categoryBudget') {
			const category = categories.find((row) => row.categoryId === change.categoryId);
			if (category) category.budget = Math.max(0, category.budget - change.amount);
		} else {
			const bill = bills.find((row) => row.id === change.billId);
			if (!bill || postponedBills.some((row) => row.billId === bill.id)) continue;
			const to = addDays(bill.dueDate, change.days);
			postponedBills.push({ billId: bill.id, from: bill.dueDate, to });
			// Only moving a bill beyond the selected month changes this month's spendable cash.
			if (bangkokMonthKey(to) !== bangkokMonthKey(bill.dueDate)) {
				if (bill.noExpenseOnPay) budget.unpaidCardBills = Math.max(0, (budget.unpaidCardBills ?? 0) - bill.amount);
				else {
					budget.unpaidBills = Math.max(0, budget.unpaidBills - bill.amount);
					const category = categories.find((row) => row.categoryId === bill.categoryId);
					if (category) category.spent = Math.max(0, category.spent - bill.amount);
				}
			}
		}
	}
	return { before, after: snapshot(budget, categories, currentDay, daysInMonth), postponedBills };
}

function snapshot(budget: BudgetInputs, categories: CategoryBudgetInput[], currentDay: number, daysInMonth: number): WhatIfSnapshot {
	const analysis = analyzeBudget({ ...budget, currentDay, daysInMonth });
	const progress = analyzeCategoryBudgets(categories, currentDay, daysInMonth);
	return {
		analysis,
		categories: progress,
		savingsRate: budget.expectedIncome > 0 ? (budget.savingsGoal / budget.expectedIncome) * 100 : 0,
		overBudget: progress.filter((row) => row.remaining < 0).map((row) => row.categoryId)
	};
}
