export interface BudgetInputs {
	expectedIncome: number;
	savingsGoal: number;
	foodDailyBudget: number;
	commuteDailyBudget: number;
	commuteDays: number;
	expense: number;
	/** Expenses paid from current cash; credit purchases are reserved as bills instead. */
	cashExpense?: number;
	unpaidCardBills?: number;
	foodSpent: number;
	commuteSpent: number;
	unpaidBills: number;
	currentDay: number;
	daysInMonth: number;
}

export interface BudgetAnalysis {
	spendable: number;
	committed: number;
	remaining: number;
	daysRemaining: number;
	safeDaily: number;
	foodMonthBudget: number;
	foodRemaining: number;
	foodSafeDaily: number;
	commuteMonthBudget: number;
	commuteRemaining: number;
	commuteSafeDaily: number;
	status: 'setup' | 'over' | 'tight' | 'ok';
}

export function analyzeBudget(input: BudgetInputs): BudgetAnalysis {
	const daysRemaining = Math.max(1, input.daysInMonth - input.currentDay + 1);
	const spendable = input.expectedIncome - input.savingsGoal;
	const committed = (input.cashExpense ?? input.expense) + input.unpaidBills + (input.unpaidCardBills ?? 0);
	const remaining = spendable - committed;
	const foodMonthBudget = input.foodDailyBudget * input.daysInMonth;
	const foodRemaining = foodMonthBudget - input.foodSpent;
	const elapsedRatio = Math.min(1, Math.max(0, input.currentDay / input.daysInMonth));
	const commuteDaysRemaining = Math.max(1, input.commuteDays - Math.round(input.commuteDays * elapsedRatio));
	const commuteMonthBudget = input.commuteDailyBudget * input.commuteDays;
	const commuteRemaining = commuteMonthBudget - input.commuteSpent;
	const safeDaily = remaining / daysRemaining;
	const baselineDaily = input.foodDailyBudget + input.commuteDailyBudget;

	return {
		spendable,
		committed,
		remaining,
		daysRemaining,
		safeDaily,
		foodMonthBudget,
		foodRemaining,
		foodSafeDaily: foodRemaining / daysRemaining,
		commuteMonthBudget,
		commuteRemaining,
		commuteSafeDaily: commuteRemaining / commuteDaysRemaining,
		status:
			input.expectedIncome <= 0 ? 'setup' : remaining < 0 ? 'over' : safeDaily < baselineDaily ? 'tight' : 'ok'
	};
}

export interface CategoryBudgetInput {
	categoryId: string;
	budget: number;
	spent: number;
}

export interface CategoryBudgetProgress extends CategoryBudgetInput {
	remaining: number;
	usedPercent: number;
	elapsedPercent: number;
	projectedSpend: number;
	projectedPercent: number;
	forecastOverBudget: boolean;
	thresholdsCrossed: number[];
}

/** Deterministic category pacing; no model call and no guessed data. */
export function analyzeCategoryBudgets(
	rows: CategoryBudgetInput[],
	currentDay: number,
	daysInMonth: number
): CategoryBudgetProgress[] {
	const elapsed = Math.min(daysInMonth, Math.max(1, currentDay));
	const elapsedPercent = Math.round((elapsed / daysInMonth) * 100);
	return rows.map((row) => {
		const budget = Math.max(0, row.budget);
		const spent = Math.max(0, row.spent);
		const usedPercent = budget > 0 ? Math.round((spent / budget) * 100) : 0;
		const projectedSpend = (spent / elapsed) * daysInMonth;
		return {
			...row,
			budget,
			spent,
			remaining: budget - spent,
			usedPercent,
			elapsedPercent,
			projectedSpend,
			projectedPercent: budget > 0 ? Math.round((projectedSpend / budget) * 100) : 0,
			forecastOverBudget: budget > 0 && projectedSpend > budget,
			thresholdsCrossed: budget > 0 ? [50, 80, 100].filter((threshold) => (spent / budget) * 100 >= threshold) : []
		};
	});
}
