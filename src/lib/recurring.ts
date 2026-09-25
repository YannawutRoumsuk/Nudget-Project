import { bangkokParts } from '$lib/utils/date';

export interface RecurringTransaction {
	id: number;
	note: string;
	amount: number;
	categoryId: string;
	paymentMethod: string;
	creditCardId: number | null;
	occurredAt: Date;
	excluded: boolean;
}

export interface RecurringCandidate {
	merchantKey: string;
	name: string;
	amount: number;
	categoryId: string;
	paymentMethod: string;
	creditCardId: number | null;
	dueDay: number;
	cycleDays: number;
	occurrences: number;
	monthlyTotal: number;
	yearlyTotal: number;
	firstSeen: Date;
	lastSeen: Date;
}

const STOP_WORDS = new Set(['จ่าย', 'ค่า', 'ซื้อ', 'รายการ', 'โอน', 'ชำระ', 'เติม', 'ใช้', 'pay', 'paid', 'payment', 'purchase', 'monthly', 'subscription', 'รายเดือน']);
const PLAN_WORDS = new Set(['basic', 'standard', 'premium', 'monthly', 'annual', 'plan']);

export function normalizeMerchant(note: string): string {
	const words = note.normalize('NFKC').toLocaleLowerCase('th-TH')
		.replace(/\b\d{1,4}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ')
		.replace(/[\d,]+(?:\.\d+)?\s*(?:บาท|฿|thb)?/gi, ' ')
		.replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
		.trim().split(/\s+/)
		.filter((word) => word && !STOP_WORDS.has(word) && !PLAN_WORDS.has(word));
	return words.join(' ').slice(0, 120).trim();
}

/** Identify only stable monthly repeats; the user still confirms every bill. */
export function detectMonthlyRecurring(transactions: RecurringTransaction[]): RecurringCandidate[] {
	const groups = new Map<string, RecurringTransaction[]>();
	for (const tx of transactions) {
		if (tx.excluded || !Number.isFinite(tx.amount) || tx.amount <= 0) continue;
		const key = normalizeMerchant(tx.note);
		if (key.length < 2) continue;
		const rows = groups.get(key) ?? [];
		rows.push(tx);
		groups.set(key, rows);
	}

	const candidates: RecurringCandidate[] = [];
	for (const [merchantKey, rows] of groups) {
		const ordered = [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
		if (ordered.length < 3) continue;
		const sample = ordered.slice(-3);
		const gaps = [dayGap(sample[0].occurredAt, sample[1].occurredAt), dayGap(sample[1].occurredAt, sample[2].occurredAt)];
		if (gaps.some((gap) => gap < 25 || gap > 35)) continue;
		const amounts = sample.map((row) => row.amount).sort((a, b) => a - b);
		const medianAmount = amounts[1];
		if (amounts[2] - amounts[0] > medianAmount * 0.1) continue;
		const categoryId = mostCommon(sample.map((row) => row.categoryId));
		const name = mostCommon(sample.map((row) => row.note.trim()).filter(Boolean)) || merchantKey;
		const parts = sample.map((row) => bangkokParts(row.occurredAt));
		candidates.push({
			merchantKey, name, amount: money(medianAmount), categoryId,
			paymentMethod: mostCommon(sample.map((row) => row.paymentMethod)),
			creditCardId: mostCommonNumber(sample.map((row) => row.creditCardId ?? 0)) || null,
			dueDay: median([parts[0].day, parts[1].day, parts[2].day]),
			cycleDays: median(gaps), occurrences: ordered.length,
			monthlyTotal: money(medianAmount), yearlyTotal: money(medianAmount * 12),
			firstSeen: ordered[0].occurredAt, lastSeen: ordered[ordered.length - 1].occurredAt
		});
	}
	return candidates.sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

function dayGap(first: Date, second: Date): number {
	const a = bangkokParts(first);
	const b = bangkokParts(second);
	return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return Math.round(sorted[Math.floor(sorted.length / 2)]);
}

function mostCommon(values: string[]): string {
	const counts = new Map<string, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))[0]?.[0] ?? '';
}

function mostCommonNumber(values: number[]): number {
	const counts = new Map<number, number>();
	for (const value of values) if (value > 0) counts.set(value, (counts.get(value) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
}

function money(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}
