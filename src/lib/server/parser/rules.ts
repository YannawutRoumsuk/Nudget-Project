import {
	ALL_CATEGORIES,
	EXPENSE_CATEGORIES,
	FALLBACK_CATEGORY,
	INCOME_CATEGORIES
} from '$lib/categories';
import type { CategoryDef } from '$lib/categories';
import type { PaymentMethod, TxKind } from '$lib/server/db/schema';
import { addDays, bangkokParts, fromBangkok } from '$lib/utils/date';
import type { BotCommand, ParsedTransaction } from './types';
import { validAmount, validCalendarDate } from './validation';

/** Thai digits are normalised away so every downstream regex sees 0-9 only. */
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

export function normalize(text: string): string {
	return text
		.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
		.replace(/\s+/g, ' ')
		.trim();
}

// ---------------------------------------------------------------- commands --

const COMMANDS: Record<string, BotCommand> = {
	help: 'help',
	'?': 'help',
	ช่วย: 'help',
	ช่วยด้วย: 'help',
	วิธีใช้: 'help',
	เมนู: 'help',
	today: 'today',
	วันนี้: 'today',
	สรุปวันนี้: 'today',
	month: 'month',
	เดือนนี้: 'month',
	สรุปเดือนนี้: 'month',
	summary: 'summary',
	สรุป: 'summary',
	ยอด: 'summary',
	บิล: 'bills',
	'บิลเดือนนี้': 'bills',
	bills: 'bills',
	งบ: 'budget',
	'งบเดือนนี้': 'budget',
	budget: 'budget',
	undo: 'undo',
	ลบ: 'undo',
	ลบล่าสุด: 'undo',
	ยกเลิก: 'undo',
	whoami: 'whoami',
	id: 'whoami',
	ไอดี: 'whoami',
	members: 'members',
	'สมาชิก': 'members',
	'ใครใช้บ้าง': 'members'
};

export function matchCommand(text: string): BotCommand | null {
	return COMMANDS[normalize(text).toLowerCase()] ?? null;
}

// -------------------------------------------------------------------- date --

const RELATIVE_DAYS: Array<[RegExp, number]> = [
	[/เมื่อวานซืน|วานซืน/, -2],
	[/เมื่อวานนี้|เมื่อวาน|วานนี้|เมื่อคืน/, -1],
	[/วันนี้|เมื่อเช้า|เมื่อกี้|ตะกี้/, 0]
];

const EXPLICIT_DATE_RE = /(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s|$)/;

export interface DateExtraction {
	occurredAt: Date;
	rest: string;
	explicit: boolean;
	invalid?: boolean;
}

/**
 * Pulls a date hint out of the message and returns the text with that hint
 * removed, so it cannot leak into the note or be mistaken for an amount.
 */
export function extractDate(text: string, now: Date): DateExtraction {
	for (const [re, offset] of RELATIVE_DAYS) {
		const m = text.match(re);
		if (!m) continue;
		const parts = bangkokParts(addDays(now, offset));
		// "Today" keeps the real clock time; past days are pinned to midday so the
		// entry cannot slip into an adjacent calendar day.
		const at = offset === 0 ? now : fromBangkok(parts.year, parts.month, parts.day, 12, 0);
		return { occurredAt: at, rest: strip(text, m), explicit: true };
	}

	const m = text.match(EXPLICIT_DATE_RE);
	if (m) {
		const day = Number(m[1]);
		const month = Number(m[2]);
		if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
			const year = resolveYear(m[3], now);
			if (!validCalendarDate(year, month, day)) {
				return { occurredAt: now, rest: strip(text, m), explicit: false, invalid: true };
			}
			return {
				occurredAt: fromBangkok(year, month, day, 12, 0),
				rest: strip(text, m),
				explicit: true
			};
		}
		return { occurredAt: now, rest: strip(text, m), explicit: false, invalid: true };
	}

	return { occurredAt: now, rest: text, explicit: false };
}

/** Accepts CE (2025), BE (2568) and their two-digit short forms (25 / 68). */
function resolveYear(raw: string | undefined, now: Date): number {
	if (!raw) return bangkokParts(now).year;
	const n = Number(raw);
	if (n > 2400) return n - 543;
	if (n >= 1900) return n;
	if (n >= 60) return 2500 + n - 543;
	return 2000 + n;
}

// ------------------------------------------------------------------ amount --

const MULTIPLIERS: Record<string, number> = {
	k: 1_000,
	พัน: 1_000,
	หมื่น: 10_000,
	แสน: 100_000,
	ล้าน: 1_000_000
};

const AMOUNT_TOKEN_RE = /(\d[\d,]*)(?:\.(\d+))?\s*(k|บาท|฿|พัน|หมื่น|แสน|ล้าน)?/gi;

export interface AmountExtraction {
	amount: number;
	rest: string;
}

/**
 * Picks the amount out of free text. A token carrying an explicit unit
 * ("85 บาท", "2k") always wins; otherwise the last bare number does, which is
 * how a human reads "ข้าว 2 จาน 120".
 */
export function extractAmount(text: string): AmountExtraction | null {
	const hits = [...text.matchAll(AMOUNT_TOKEN_RE)];
	if (hits.length === 0) return null;

	const chosen = hits.find((h) => h[3]) ?? hits[hits.length - 1];
	if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(chosen[1]) || (chosen[2]?.length ?? 0) > 2) return null;

	const whole = chosen[1].replace(/,/g, '');
	const fraction = chosen[2] ? `.${chosen[2]}` : '';
	const unit = chosen[3]?.toLowerCase();
	const multiplier = unit ? (MULTIPLIERS[unit] ?? 1) : 1;
	const amount = Number(`${whole}${fraction}`) * multiplier;

	if (!validAmount(amount)) return null;
	return { amount: Math.round(amount * 100) / 100, rest: strip(text, chosen) };
}

// -------------------------------------------------------------------- kind --

const INCOME_PREFIX_RE = /^(\+|รับ|ได้รับ|ได้|เข้า|รายรับ|income)\s*/i;
const INCOME_ANYWHERE_RE = /ได้รับ|รายรับ|เงินเข้า|โอนเข้า|ได้เงิน/;
const EXPENSE_PREFIX_RE = /^(-|จ่าย|ซื้อ|เสีย|รายจ่าย|expense)\s*/i;

export interface KindExtraction {
	kind: TxKind | null;
	rest: string;
}

export function extractKind(text: string): KindExtraction {
	const income = text.match(INCOME_PREFIX_RE);
	if (income) return { kind: 'income', rest: text.slice(income[0].length).trim() };

	const expense = text.match(EXPENSE_PREFIX_RE);
	if (expense) return { kind: 'expense', rest: text.slice(expense[0].length).trim() };

	if (INCOME_ANYWHERE_RE.test(text)) return { kind: 'income', rest: text };
	return { kind: null, rest: text };
}

export function extractPaymentMethod(text: string): { paymentMethod: PaymentMethod; rest: string } {
	const options: Array<[RegExp, PaymentMethod]> = [
		[/(?:จ่าย)?บัตรเครดิต|เครดิตการ์ด/gi, 'credit_card'],
		[/เงินสด/gi, 'cash'],
		[/วอลเล็ต|wallet|true\s*money/gi, 'wallet'],
		[/โอน(?:เงิน)?|บัญชี/gi, 'bank']
	];
	for (const [pattern, paymentMethod] of options) {
		if (!pattern.test(text)) continue;
		return { paymentMethod, rest: text.replace(pattern, ' ').replace(/\s+/g, ' ').trim() };
	}
	return { paymentMethod: 'bank', rest: text };
}

// ---------------------------------------------------------------- category --

interface KeywordEntry {
	keyword: string;
	category: CategoryDef;
}

/** Longest keyword first, so "ค่าน้ำ" (bills) beats "น้ำ" (food). */
function buildIndex(categories: CategoryDef[]): KeywordEntry[] {
	return categories
		.flatMap((category) => category.keywords.map((keyword) => ({ keyword, category })))
		.sort((a, b) => b.keyword.length - a.keyword.length);
}

const INDEX_ALL = buildIndex(ALL_CATEGORIES);
const INDEX_EXPENSE = buildIndex(EXPENSE_CATEGORIES);
const INDEX_INCOME = buildIndex(INCOME_CATEGORIES);

export function matchCategory(text: string, kind: TxKind | null): CategoryDef | null {
	const haystack = text.toLowerCase();
	const index = kind === 'income' ? INDEX_INCOME : kind === 'expense' ? INDEX_EXPENSE : INDEX_ALL;
	for (const { keyword, category } of index) {
		if (haystack.includes(keyword)) return category;
	}
	return null;
}

// ------------------------------------------------------------------- parse --

export interface RuleParse {
	tx: ParsedTransaction;
	/** False when the category was a guess — the caller may ask an LLM instead. */
	categoryMatched: boolean;
}

export function parseByRules(rawText: string, now: Date): RuleParse | null {
	const text = normalize(rawText);
	if (!text) return null;

	const dated = extractDate(text, now);
	if (dated.invalid) return null;
	const signed = extractKind(dated.rest);
	const payment = extractPaymentMethod(signed.rest);
	const amount = extractAmount(payment.rest);
	if (!amount) return null;

	const category = matchCategory(text, signed.kind);
	const kind: TxKind = signed.kind ?? category?.kind ?? 'expense';

	return {
		tx: {
			kind,
			amount: amount.amount,
			categoryId: category?.id ?? FALLBACK_CATEGORY[kind],
			note: cleanNote(amount.rest),
			occurredAt: dated.occurredAt,
			parsedBy: 'rule',
			paymentMethod: payment.paymentMethod
		},
		categoryMatched: category !== null
	};
}

function cleanNote(text: string): string {
	return text
		.replace(/^[\s,.:;+-]+/u, '')
		.replace(/[\s,.:;+-]+$/u, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function strip(text: string, match: RegExpMatchArray): string {
	const start = match.index ?? 0;
	const head = text.slice(0, start);
	const tail = text.slice(start + match[0].length);
	return `${head} ${tail}`.replace(/\s+/g, ' ').trim();
}
