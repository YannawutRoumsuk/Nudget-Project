import { describe, expect, it } from 'vitest';
import {
	extractAmount,
	extractDate,
	extractKind,
	matchCategory,
	matchCommand,
	normalize,
	parseByRules
} from '../src/lib/server/parser/rules';
import { bangkokDayKey } from '../src/lib/utils/date';

/** 1 Sep 2026, 14:30 Bangkok. Fixed so date maths is deterministic. */
const NOW = new Date('2026-09-01T07:30:00.000Z');

function parse(text: string) {
	const result = parseByRules(text, NOW);
	if (!result) throw new Error(`expected a parse for: ${text}`);
	return result;
}

describe('normalize', () => {
	it('converts Thai digits to Arabic', () => {
		expect(normalize('๑๒๐ ข้าว')).toBe('120 ข้าว');
	});

	it('collapses whitespace', () => {
		expect(normalize('  ข้าว    60  ')).toBe('ข้าว 60');
	});
});

describe('matchCommand', () => {
	it.each([
		['ช่วย', 'help'],
		['help', 'help'],
		['วันนี้', 'today'],
		['เดือนนี้', 'month'],
		['บิล', 'bills'],
		['งบ', 'budget'],
		['ลบ', 'undo'],
		['ไอดี', 'whoami']
	])('maps %s to %s', (input, expected) => {
		expect(matchCommand(input)).toBe(expected);
	});

	it('does not treat a message containing a command word as a command', () => {
		expect(matchCommand('วันนี้ ข้าว 50')).toBeNull();
	});
});

describe('extractAmount', () => {
	it.each(['ข้าว 60.123', 'ข้าว 1,23', 'ข้าว 0', 'ข้าว 10000000000'])('rejects invalid or out-of-range amount %s', (text) => {
		expect(extractAmount(text)).toBeNull();
	});
	it('reads a plain number', () => {
		expect(extractAmount('ข้าวเที่ยง 60')?.amount).toBe(60);
	});

	it('reads thousands separators', () => {
		expect(extractAmount('ค่าน้ำมัน 1,200')?.amount).toBe(1200);
	});

	it('applies k and Thai magnitude suffixes', () => {
		expect(extractAmount('5k')?.amount).toBe(5000);
		expect(extractAmount('2 หมื่น')?.amount).toBe(20000);
	});

	it('prefers the token carrying a unit over a bare number', () => {
		expect(extractAmount('ข้าว 2 จาน 85 บาท')?.amount).toBe(85);
	});

	it('falls back to the last bare number', () => {
		expect(extractAmount('ข้าว 2 จาน 120')?.amount).toBe(120);
	});

	it('keeps satang', () => {
		expect(extractAmount('กาแฟ 62.50')?.amount).toBe(62.5);
	});

	it('returns null when there is no number', () => {
		expect(extractAmount('ข้าวเที่ยง')).toBeNull();
	});

	it('removes the amount from the remaining text', () => {
		expect(extractAmount('ข้าวเที่ยง 60')?.rest).toBe('ข้าวเที่ยง');
	});
});

describe('extractKind', () => {
	it('reads a leading plus as income', () => {
		expect(extractKind('+เงินเดือน 30000')).toEqual({ kind: 'income', rest: 'เงินเดือน 30000' });
	});

	it('reads a leading minus as expense', () => {
		expect(extractKind('-ข้าว 60')).toEqual({ kind: 'expense', rest: 'ข้าว 60' });
	});

	it('reads Thai income verbs', () => {
		expect(extractKind('รับ ฟรีแลนซ์ 5000').kind).toBe('income');
		expect(extractKind('โอนเข้า 900').kind).toBe('income');
	});

	it('leaves the kind undecided when nothing signals direction', () => {
		expect(extractKind('ข้าวเที่ยง 60').kind).toBeNull();
	});
});

describe('matchCategory', () => {
	it('prefers the longest keyword so ค่าน้ำ beats น้ำ', () => {
		expect(matchCategory('ค่าน้ำ 350', 'expense')?.id).toBe('bills');
	});

	it('routes น้ำมัน to transport, not to food', () => {
		expect(matchCategory('ค่าน้ำมัน 1200', 'expense')?.id).toBe('transport');
	});

	it('only considers income categories when the kind is income', () => {
		expect(matchCategory('ได้เงินค่าข้าว 500', 'income')?.id).toBeUndefined();
	});

	it('returns null for text with no known keyword', () => {
		expect(matchCategory('zzzz 50', 'expense')).toBeNull();
	});
});

describe('extractDate', () => {
	it('defaults to now', () => {
		const result = extractDate('ข้าว 60', NOW);
		expect(result.explicit).toBe(false);
		expect(result.occurredAt).toEqual(NOW);
	});

	it('understands เมื่อวาน', () => {
		const result = extractDate('เมื่อวาน ข้าว 50', NOW);
		expect(bangkokDayKey(result.occurredAt)).toBe('2026-08-31');
		expect(result.rest).toBe('ข้าว 50');
	});

	it('understands เมื่อวานซืน before เมื่อวาน', () => {
		expect(bangkokDayKey(extractDate('เมื่อวานซืน ข้าว 50', NOW).occurredAt)).toBe('2026-08-30');
	});

	it('reads d/m', () => {
		expect(bangkokDayKey(extractDate('12/8 ค่าไฟ 800', NOW).occurredAt)).toBe('2026-08-12');
	});

	it('reads a Buddhist-era year', () => {
		expect(bangkokDayKey(extractDate('12/8/2568 ค่าไฟ 800', NOW).occurredAt)).toBe('2025-08-12');
	});

	it('ignores an impossible month', () => {
		expect(extractDate('12/44 ค่าไฟ 800', NOW).explicit).toBe(false);
	});
});

describe('parseByRules', () => {
	it.each(['31/2 ข้าว 60', '29/2/2026 ข้าว 60', '31/4 ข้าว 60', '12/44 ข้าว 60'])('rejects impossible date in %s', (text) => {
		expect(parseByRules(text, NOW)).toBeNull();
	});
	it('accepts leap day in a leap year', () => {
		expect(bangkokDayKey(parse('29/2/2024 ข้าว 60').tx.occurredAt)).toBe('2024-02-29');
	});
	it('parses a plain lunch entry', () => {
		const { tx, categoryMatched } = parse('ข้าวเที่ยง 60');
		expect(tx).toMatchObject({
			kind: 'expense',
			amount: 60,
			categoryId: 'food',
			note: 'ข้าวเที่ยง',
			parsedBy: 'rule'
		});
		expect(categoryMatched).toBe(true);
	});

	it('records credit-card usage without treating it as a bill category', () => {
		const { tx } = parse('กาแฟ 85 บัตรเครดิต');
		expect(tx).toMatchObject({ amount: 85, categoryId: 'food', note: 'กาแฟ', paymentMethod: 'credit_card' });
	});

	it('parses income with a plus prefix', () => {
		const { tx } = parse('+เงินเดือน 30000');
		expect(tx).toMatchObject({ kind: 'income', amount: 30000, categoryId: 'salary' });
	});

	it('infers income from the category alone', () => {
		const { tx } = parse('โบนัส 2 หมื่น');
		expect(tx).toMatchObject({ kind: 'income', amount: 20000, categoryId: 'bonus' });
	});

	it('parses an expense verb prefix', () => {
		const { tx } = parse('จ่ายค่าเช่า 8500');
		expect(tx).toMatchObject({ kind: 'expense', amount: 8500, categoryId: 'bills' });
	});

	it('keeps the date out of the note', () => {
		const { tx } = parse('เมื่อวาน แท็กซี่ 120');
		expect(tx.note).toBe('แท็กซี่');
		expect(bangkokDayKey(tx.occurredAt)).toBe('2026-08-31');
		expect(tx.categoryId).toBe('transport');
	});

	it('falls back to อื่นๆ and reports the category as unmatched', () => {
		const { tx, categoryMatched } = parse('zzzz 250');
		expect(tx.categoryId).toBe('other');
		expect(categoryMatched).toBe(false);
	});

	it('returns null when there is no amount', () => {
		expect(parseByRules('ข้าวเที่ยงอร่อยมาก', NOW)).toBeNull();
	});

	it('returns null for an empty message', () => {
		expect(parseByRules('   ', NOW)).toBeNull();
	});

	it('never produces a negative amount', () => {
		const { tx } = parse('-ข้าว 60');
		expect(tx.amount).toBe(60);
		expect(tx.kind).toBe('expense');
	});
});
