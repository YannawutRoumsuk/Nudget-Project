export interface BudgetInputs {
	expectedIncome: number;
	savingsGoal: number;
	foodDailyBudget: number;
	commuteDailyBudget: number;
	commuteDays: number;
	expense: number;
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
	const spendable = Math.max(0, input.expectedIncome - input.savingsGoal);
	const committed = input.expense + input.unpaidBills;
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
