import { describe, expect, it } from 'vitest';
import {
	confirmSaved,
	confirmNoteUpdated,
	feedbackPromptText,
	feedbackThanksText,
	feedbackTooManyText,
	helpText,
	newFeedbackText,
	noReleaseText,
	releaseNotesText,
	slipReviewText,
	unknownText,
	welcomeText,
	joinedText
} from '../src/lib/server/line/messages';
import type { ReleaseNote } from '../src/lib/releases';
import { cleanNote, matchCommand, parseByRules } from '../src/lib/server/parser/rules';
import type { HelpTopic } from '../src/lib/server/parser/types';
import type { Transaction } from '../src/lib/server/db/schema';

const NOW = new Date('2026-09-01T07:30:00.000Z');

const HELP_TOPICS: HelpTopic[] = ['overview', 'record', 'slip', 'web', 'bills', 'commands'];

describe('slip review confidence', () => {
	it('points out only fields below the confidence threshold', () => {
		const text = slipReviewText({
			id: 1, amount: 120, occurredAt: NOW, recipient: 'ร้านตัวอย่าง', categoryId: 'food', paymentMethod: 'bank',
			amountConfidence: 0.98, dateConfidence: 0.55, recipientConfidence: 0.4
		});
		expect(text).toContain('วันที่อ่านได้ไม่ชัด');
		expect(text).toContain('ผู้รับอ่านได้ไม่ชัด');
		expect(text).not.toContain('ยอดเงินอ่านได้ไม่ชัด');
	});
});

function fakeTx(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: 1,
		userId: 1,
		kind: 'expense',
		amount: '60.00',
		categoryId: 'food',
		note: '',
		occurredAt: NOW,
		paymentMethod: 'bank',
		billId: null,
		source: 'line',
		parsedBy: 'rule',
		rawText: 'ข้าวเที่ยง 60',
		lineUserId: 'U123',
		createdAt: NOW,
		...overrides
	} as Transaction;
}

describe('helpText', () => {
	it.each(HELP_TOPICS)('returns non-empty text under 1800 chars for topic %s', (topic) => {
		const text = helpText(topic);
		expect(text.length).toBeGreaterThan(0);
		expect(text.length).toBeLessThan(1800);
	});

	it('defaults to the overview page', () => {
		expect(helpText()).toBe(helpText('overview'));
	});

	it('mentions the login step in the web topic', () => {
		expect(helpText('web')).toContain('เข้าสู่ระบบด้วย LINE');
	});

	it('lists the sub-topics in the overview page', () => {
		const text = helpText('overview');
		expect(text).toContain('ช่วย บันทึก');
		expect(text).toContain('ช่วย สลิป');
		expect(text).toContain('ช่วย เว็บ');
		expect(text).toContain('ช่วย บิล');
		expect(text).toContain('ช่วย คำสั่ง');
	});
});

describe('unknownText', () => {
	it('gives a different hint for a bare number, a bare word, and gibberish', () => {
		const numberOnly = unknownText('500');
		const nameOnly = unknownText('กาแฟ');
		const gibberish = unknownText('!!!@@@###');
		expect(numberOnly).not.toBe(nameOnly);
		expect(nameOnly).not.toBe(gibberish);
		expect(numberOnly).not.toBe(gibberish);
	});

	it('recognises a bare date shape', () => {
		expect(unknownText('1/9')).toContain('วันที่');
	});
});

describe('welcomeText / joinedText', () => {
	it('gives three concrete things to try', () => {
		for (const text of [welcomeText(), joinedText()]) {
			expect(text).toContain('ข้าว 60');
			expect(text).toContain('เว็บ');
			expect(text).toContain('ช่วย');
		}
	});

	it('tells the user their data is private', () => {
		expect(welcomeText()).toContain('มองไม่เห็นรายการของคุณ');
		expect(joinedText()).toContain('มองไม่เห็นรายการของคุณ');
	});
});

describe('matchCommand', () => {
	it.each([
		['ช่วยเหลือ', 'help'],
		['ใช้ยังไง', 'help'],
		['ทำไง', 'help'],
		['ฟีดแบ็ก', 'feedback'],
		['ฟีดแบค', 'feedback'],
		['แจ้งปัญหา', 'feedback'],
		['ติดต่อ', 'feedback'],
		['มีอะไรใหม่', 'release'],
		['อัปเดต', 'release'],
		['whatsnew', 'release']
	])('maps %s to %s', (input, expected) => {
		expect(matchCommand(input)).toBe(expected);
	});

	it('parses a help sub-topic', () => {
		expect(matchCommand('ช่วย เว็บ')).toEqual({ command: 'help', topic: 'web' });
		expect(matchCommand('ช่วย บันทึก')).toEqual({ command: 'help', topic: 'record' });
		expect(matchCommand('ช่วย สลิป')).toEqual({ command: 'help', topic: 'slip' });
		expect(matchCommand('ช่วย บิล')).toEqual({ command: 'help', topic: 'bills' });
		expect(matchCommand('ช่วย คำสั่ง')).toEqual({ command: 'help', topic: 'commands' });
	});

	it('still maps bare "ช่วย" to the plain help command', () => {
		expect(matchCommand('ช่วย')).toBe('help');
	});

	it('parses a note command with its free-text payload', () => {
		expect(matchCommand('โน้ต กับพี่ตุ้ย')).toEqual({ command: 'note', text: 'กับพี่ตุ้ย' });
		expect(matchCommand('หมายเหตุ ซื้อของฝาก')).toEqual({ command: 'note', text: 'ซื้อของฝาก' });
	});
});

describe('cleanNote', () => {
	it('keeps the descriptive remainder and drops the redundant category keyword', () => {
		expect(cleanNote('ค่าอาหาร ข้าวมันไก่ มื้อเที่ยง กับพี่ตุ๊ก', 'expense')).toBe(
			'ข้าวมันไก่ มื้อเที่ยง กับพี่ตุ๊ก'
		);
	});

	it('keeps the note when it is only the category keyword', () => {
		expect(cleanNote('ข้าวเที่ยง', 'expense')).toBe('ข้าวเที่ยง');
		expect(cleanNote('กาแฟ', 'expense')).toBe('กาแฟ');
	});

	it('strips the amount out of the note via the full parse pipeline', () => {
		const result = parseByRules('ค่าอาหาร ข้าวมันไก่ 60', NOW);
		expect(result?.tx.note).toBe('ข้าวมันไก่');
		expect(result?.tx.note).not.toContain('60');
	});

	it('caps a long note at 120 characters, trimmed on a word boundary', () => {
		const words = Array.from({ length: 30 }, (_, i) => `คำที่${i}`);
		const long = words.join(' ');
		const note = cleanNote(long, null);
		expect(note.length).toBeLessThanOrEqual(120);
		expect(long.startsWith(note)).toBe(true);
		// The cut lands on a space in the original string, not mid-word.
		const nextChar = long[note.length];
		expect(nextChar === ' ' || nextChar === undefined).toBe(true);
	});
});

describe('confirmSaved', () => {
	it('shows the stored note on its own line', () => {
		const text = confirmSaved(fakeTx({ note: 'กับพี่ตุ้ย' }), false);
		expect(text).toContain('กับพี่ตุ้ย');
	});

	it('invites adding a note when there is none', () => {
		const text = confirmSaved(fakeTx({ note: '' }), false);
		expect(text).toContain('โน้ต');
	});
});

describe('confirmNoteUpdated', () => {
	it('echoes the new note back', () => {
		const text = confirmNoteUpdated(fakeTx({ note: 'ของฝาก' }), 'ของฝาก');
		expect(text).toContain('ของฝาก');
	});
});

describe('feedback copy', () => {
	it('every feedback text is non-empty', () => {
		expect(feedbackPromptText().length).toBeGreaterThan(0);
		expect(feedbackThanksText().length).toBeGreaterThan(0);
		expect(feedbackTooManyText().length).toBeGreaterThan(0);
	});

	it('mentions cancelling in the prompt', () => {
		expect(feedbackPromptText()).toContain('ยกเลิก');
	});

	it('renders what the owner receives', () => {
		const text = newFeedbackText('คุณเอ', 'บอทช้าไปหน่อย', NOW);
		expect(text).toContain('คุณเอ');
		expect(text).toContain('บอทช้าไปหน่อย');
	});
});

describe('release notes', () => {
	it('renders a release as a card', () => {
		const release: ReleaseNote = {
			version: '1.4.0',
			date: NOW,
			title: 'จดโน้ตได้ละเอียดขึ้น',
			highlights: ['เพิ่มคำสั่งโน้ต', 'ปรับข้อความช่วยเหลือ']
		};
		const text = releaseNotesText(release);
		expect(text).toContain('1.4.0');
		expect(text).toContain('เพิ่มคำสั่งโน้ต');
		expect(text).toContain('ปรับข้อความช่วยเหลือ');
	});

	it('has a fallback for no release', () => {
		expect(noReleaseText().length).toBeGreaterThan(0);
	});
});
