import { bangkokParts } from '$lib/utils/date';

export interface SavingsGoalInput {
	name: string;
	targetAmount: number;
	currentAmount: number;
	targetDate: Date | null;
	monthlyContribution: number;
}

/** Reserve evenly through the target month. Without a date, use the user's chosen monthly amount. */
export function monthlyGoalReserve(goal: SavingsGoalInput, now = new Date()): number {
	const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
	if (remaining === 0) return 0;
	if (!goal.targetDate) return roundMoney(Math.min(remaining, Math.max(0, goal.monthlyContribution)));
	const current = bangkokParts(now);
	const months = Math.max(1, (goal.targetDate.getUTCFullYear() - current.year) * 12 + (goal.targetDate.getUTCMonth() + 1) - current.month + 1);
	return roundMoney(remaining / months);
}

export function roundMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

