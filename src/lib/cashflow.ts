import { bangkokDayKey } from '$lib/utils/date';

export interface CashflowActualDay {
	day: string;
	income: number;
	expense: number;
}

export interface CashflowBill {
	id: number;
	name: string;
	amount: number;
	dueDate: Date;
}

export interface CashflowSettlement {
	billId: number;
	name: string;
	amount: number;
	paidAt: Date;
}

export interface CashflowEvent {
	title: string;
	amount: number;
	type: 'income' | 'expense';
	status: 'actual' | 'forecast';
	href?: string;
	late?: boolean;
}

export interface CashflowDay {
	key: string;
	day: number;
	events: CashflowEvent[];
	actualIncome: number;
	actualExpense: number;
	forecastIncome: number;
	forecastExpense: number;
	endingBalance: number;
}

export interface CashflowInput {
	year: number;
	month: number;
	openingBalance: number;
	plannedIncome: number;
	plannedIncomeDay: number;
	actualDays: CashflowActualDay[];
	unpaidBills: CashflowBill[];
	settlements: CashflowSettlement[];
	currentDay: number;
	isCurrentMonth: boolean;
}

export function buildCashflowCalendar(input: CashflowInput): { days: CashflowDay[]; weekdayOffset: number; lowestDay: string | null; forecastIncome: number } {
	const daysInMonth = new Date(Date.UTC(input.year, input.month, 0)).getUTCDate();
	const dayMap = new Map<string, CashflowDay>();
	for (let day = 1; day <= daysInMonth; day += 1) {
		const key = `${input.year}-${String(input.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		dayMap.set(key, { key, day, events: [], actualIncome: 0, actualExpense: 0, forecastIncome: 0, forecastExpense: 0, endingBalance: 0 });
	}
	for (const point of input.actualDays) {
		const target = dayMap.get(point.day);
		if (!target) continue;
		target.actualIncome += point.income;
		target.actualExpense += point.expense;
		if (point.income) target.events.push({ title: 'รายรับจริง', amount: point.income, type: 'income', status: 'actual', href: transactionDayHref(point.day) });
		if (point.expense) target.events.push({ title: 'รายจ่ายเงินจริง', amount: point.expense, type: 'expense', status: 'actual', href: transactionDayHref(point.day) });
	}
	for (const settlement of input.settlements) {
		const key = bangkokDayKey(settlement.paidAt);
		const target = dayMap.get(key);
		if (!target) continue;
		target.actualExpense += settlement.amount;
		target.events.push({ title: `จ่ายบัตร · ${settlement.name}`, amount: settlement.amount, type: 'expense', status: 'actual', href: '/bills' });
	}
	for (const bill of input.unpaidBills) {
		const dueKey = bangkokDayKey(bill.dueDate);
		const target = dayMap.get(dueKey) ?? (dueKey < [...dayMap.keys()][0] ? dayMap.get([...dayMap.keys()][0]) : undefined);
		if (!target) continue;
		const late = dueKey < target.key;
		target.forecastExpense += bill.amount;
		target.events.push({ title: `บิล${late ? ' เกินกำหนด' : ''} · ${bill.name}`, amount: bill.amount, type: 'expense', status: 'forecast', href: '/bills', late });
	}
	const actualIncomeTotal = input.actualDays.reduce((sum, point) => sum + point.income, 0);
	const forecastIncome = input.isCurrentMonth ? Math.max(0, input.plannedIncome - actualIncomeTotal) : 0;
	if (forecastIncome > 0) {
		const dueDay = Math.min(daysInMonth, Math.max(1, input.plannedIncomeDay));
		const delayed = input.isCurrentMonth && dueDay < input.currentDay;
		const day = delayed ? input.currentDay : dueDay;
		const target = dayMap.get(`${input.year}-${String(input.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)!;
		target.forecastIncome += forecastIncome;
		target.events.push({ title: delayed ? 'รายรับตามแผน · เลยกำหนด' : 'รายรับตามแผน', amount: forecastIncome, type: 'income', status: 'forecast' });
	}
	let balance = input.openingBalance;
	const days = [...dayMap.values()];
	for (const day of days) {
		balance += day.actualIncome + day.forecastIncome - day.actualExpense - day.forecastExpense;
		day.endingBalance = balance;
	}
	const forecastFrom = input.isCurrentMonth ? Math.max(1, Math.min(daysInMonth, input.currentDay)) : 1;
	const lowest = days.filter((day) => day.day >= forecastFrom).reduce<CashflowDay | null>((min, day) => !min || day.endingBalance < min.endingBalance ? day : min, null);
	return { days, weekdayOffset: new Date(Date.UTC(input.year, input.month - 1, 1)).getUTCDay(), lowestDay: lowest?.key ?? null, forecastIncome };
}

function transactionDayHref(day: string): string {
	return `/transactions?month=${day.slice(0, 7)}&day=${day}`;
}

export function dayName(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Intl.DateTimeFormat('th-TH', { weekday: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
