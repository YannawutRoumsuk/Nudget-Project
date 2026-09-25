export interface MonthlyForecastInput {
	year: number;
	month: number;
	currentDay: number;
	daysInMonth: number;
	isCurrentMonth: boolean;
	actualIncome: number;
	expectedIncome: number;
	openingBalance: number;
	fixedActual: number;
	variableActual: number;
	specialActual: number;
	knownFixedBills: number;
	knownVariableBills: number;
	cardPayables: number;
	historicalVariablePerDay: number[];
	monthlyBudget: number | null;
	savingsGoal: number;
}

export interface MonthlyForecast {
	elapsedDays: number;
	daysRemaining: number;
	historyMonths: number;
	lowSample: boolean;
	unknownVariableForecast: boolean;
	fixedExpense: number;
	variableActual: number;
	specialExpense: number;
	knownBills: number;
	variableRemaining: { low: number; median: number; high: number } | null;
	totalExpense: { low: number; median: number; high: number } | null;
	incomeEstimate: number;
	cashRemaining: { low: number; median: number; high: number } | null;
	budgetOver: number | null;
	savingsGoalGap: number | null;
}

/** Deterministic month-end estimate. Special transactions stay in actuals and leave the forward baseline. */
export function forecastMonth(input: MonthlyForecastInput): MonthlyForecast {
	const elapsedDays = Math.max(1, Math.min(input.currentDay, input.daysInMonth));
	const daysRemaining = input.isCurrentMonth ? Math.max(0, input.daysInMonth - elapsedDays) : 0;
	const rates = input.historicalVariablePerDay.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
	const historyMonths = rates.length;
	const lowSample = historyMonths < 3;
	let variableRemaining: MonthlyForecast['variableRemaining'] = null;
	const currentDailyRate = Math.max(0, input.variableActual) / elapsedDays;

	if (daysRemaining === 0) variableRemaining = { low: 0, median: 0, high: 0 };
	else if (rates.length) {
		const historicalMedian = quantile(rates, 0.5);
		const currentWeight = Math.min(0.6, elapsedDays / (elapsedDays + 14));
		const centerRate = input.variableActual > 0
			? historicalMedian * (1 - currentWeight) + currentDailyRate * currentWeight
			: historicalMedian;
		const lowRate = rates.length >= 3 ? quantile(rates, 0.25) : Math.min(rates[0], centerRate * 0.5);
		const highRate = rates.length >= 3 ? quantile(rates, 0.75) : Math.max(rates[rates.length - 1], centerRate * 1.5);
		variableRemaining = {
			low: money(Math.min(centerRate, lowRate) * daysRemaining),
			median: money(centerRate * daysRemaining),
			high: money(Math.max(centerRate, highRate) * daysRemaining)
		};
	} else if (input.variableActual > 0) {
		variableRemaining = { low: money(currentDailyRate * daysRemaining * 0.5), median: money(currentDailyRate * daysRemaining), high: money(currentDailyRate * daysRemaining * 1.5) };
	}

	const fixedExpense = money(input.fixedActual);
	const variableActual = money(input.variableActual);
	const specialExpense = money(input.specialActual);
	const knownBills = money(input.knownFixedBills + input.knownVariableBills);
	const totalExpense = variableRemaining ? {
		low: money(fixedExpense + variableActual + specialExpense + knownBills + variableRemaining.low),
		median: money(fixedExpense + variableActual + specialExpense + knownBills + variableRemaining.median),
		high: money(fixedExpense + variableActual + specialExpense + knownBills + variableRemaining.high)
	} : null;
	const incomeEstimate = money(Math.max(input.actualIncome, input.expectedIncome));
	const cashRemaining = totalExpense ? {
		low: money(input.openingBalance + incomeEstimate - totalExpense.high - input.cardPayables),
		median: money(input.openingBalance + incomeEstimate - totalExpense.median - input.cardPayables),
		high: money(input.openingBalance + incomeEstimate - totalExpense.low - input.cardPayables)
	} : null;
	return {
		elapsedDays, daysRemaining, historyMonths, lowSample, unknownVariableForecast: variableRemaining === null,
		fixedExpense, variableActual, specialExpense, knownBills, variableRemaining, totalExpense, incomeEstimate, cashRemaining,
		budgetOver: totalExpense && input.monthlyBudget !== null ? money(totalExpense.median - input.monthlyBudget) : null,
		savingsGoalGap: cashRemaining ? money(input.savingsGoal - cashRemaining.median) : null
	};
}

function quantile(sorted: number[], fraction: number): number {
	if (sorted.length === 0) return 0;
	const position = (sorted.length - 1) * fraction;
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function money(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}
