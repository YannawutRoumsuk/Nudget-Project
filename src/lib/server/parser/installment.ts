import { EXPENSE_CATEGORIES } from '$lib/categories';
import { bangkokParts, daysInBangkokMonth, fromBangkok, addMonths } from '$lib/utils/date';
import { normalize } from './rules';
import { validAmount } from './validation';

export interface InstallmentBill {
	/** 1-based position in the plan, in the order the amounts were typed. */
	sequence: number;
	amount: number;
	dueDate: Date;
}

export interface InstallmentPlan {
	name: string;
	categoryId: string;
	bills: InstallmentBill[];
}

const MAX_MONTHS = 36;

/**
 * "บิล" / "ผ่อน" / "งวด" is what separates a payment plan from an ordinary
 * expense that happens to mention months. Without the cue, "ค่าเน็ต 3 เดือน
 * 1500" would silently become three bills instead of one payment.
 */
const PLAN_CUE_RE = /(บิล|ผ่อน|งวด|installment)/i;
const MONTH_COUNT_RE = /(\d{1,2})\s*(?:เดือน|งวด)/;
const AMOUNT_RE = /(?<![\d,.])(\d[\d,]*(?:\.\d{1,2})?)(?![\d,.])/g;

function amountAt(month: number, day: number, reference: Date): Date {
	const start = addMonths(fromBangkok(bangkokParts(reference).year, bangkokParts(reference).month, 1, 9), month);
	const parts = bangkokParts(start);
	// The 31st does not exist every month; land on the last day instead of
	// rolling into the next one, which would move the bill a whole month.
	const safeDay = Math.min(day, daysInBangkokMonth(start));
	return fromBangkok(parts.year, parts.month, safeDay, 9);
}

/**
 * Reads "บิล shoppe 3 เดือน 4050 3800 3800" as a payment plan: three bills, one
 * per month, in the order the amounts were typed.
 *
 * Two shapes are accepted — one amount per month, or a single amount repeated
 * for every month ("ผ่อน 3 เดือน 1500"). Any other count is ambiguous and is
 * left to the ordinary parser rather than guessed at.
 */
export function parseInstallment(rawText: string, now = new Date()): InstallmentPlan | null {
	const text = normalize(rawText);
	if (!PLAN_CUE_RE.test(text)) return null;

	const monthMatch = text.match(MONTH_COUNT_RE);
	if (!monthMatch) return null;
	const months = Number(monthMatch[1]);
	if (!Number.isInteger(months) || months < 2 || months > MAX_MONTHS) return null;

	// The month count is not one of the amounts.
	const withoutCount = text.replace(MONTH_COUNT_RE, ' ');
	const amounts = [...withoutCount.matchAll(AMOUNT_RE)]
		.map((match) => Number(match[1].replace(/,/g, '')))
		.filter((amount) => validAmount(amount));
	if (amounts.length !== months && amounts.length !== 1) return null;

	const perMonth = amounts.length === 1 ? Array<number>(months).fill(amounts[0]) : amounts;
	const name = withoutCount
		.replace(AMOUNT_RE, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!name) return null;

	const day = bangkokParts(now).day;
	return {
		name,
		categoryId: EXPENSE_CATEGORIES.some((category) => category.id === 'bills') ? 'bills' : EXPENSE_CATEGORIES[0].id,
		bills: perMonth.map((amount, index) => ({
			sequence: index + 1,
			amount,
			dueDate: amountAt(index, day, now)
		}))
	};
}
