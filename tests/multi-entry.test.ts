import { describe, expect, it } from 'vitest';
import { parseEntries } from '../src/lib/server/parser';

const now = new Date('2026-09-06T05:00:00Z');

async function amounts(text: string) {
	const outcomes = await parseEntries(text, now);
	return outcomes.map((outcome) => (outcome.type === 'transaction' ? outcome.tx.amount : outcome.type));
}

describe('one entry per line', () => {
	it('records every line of a list instead of only the last', async () => {
		const outcomes = await parseEntries('กาแฟ 60\nน้ำ 30\nข้าว 50', now);
		expect(outcomes).toHaveLength(3);
		expect(outcomes.map((o) => (o.type === 'transaction' ? o.tx.amount : null))).toEqual([60, 30, 50]);
		// The note must be just that line — the old behaviour swept the other
		// entries into it, which is how the money went missing.
		expect(outcomes.map((o) => (o.type === 'transaction' ? o.tx.note : null))).toEqual(['กาแฟ', 'น้ำ', 'ข้าว']);
	});

	it('handles carriage returns, blank lines and stray spacing', async () => {
		expect(await amounts('  กาแฟ 60  \r\n\r\n น้ำ 30 \n')).toEqual([60, 30]);
	});

	it('keeps a bare number inside a line attached to its note', async () => {
		// "ข้าว 2 จาน 120" is one plate order, not two entries: splitting on
		// spaces would invent an entry nobody typed.
		expect(await amounts('ข้าว 2 จาน 120')).toEqual([120]);
	});

	it('reads a wrapped note as one entry rather than a list', async () => {
		// Only one line carries money, so the whole message stays a single entry.
		const outcomes = await parseEntries('ค่าซ่อมรถ\nที่อู่ประจำ 1200', now);
		expect(outcomes).toHaveLength(1);
		expect(outcomes[0].type === 'transaction' && outcomes[0].tx.amount).toBe(1200);
	});

	it('reports a line it could not read instead of dropping it silently', async () => {
		const outcomes = await parseEntries('กาแฟ 60\nอะไรสักอย่าง\nข้าว 50', now);
		expect(outcomes.map((o) => o.type)).toEqual(['transaction', 'unknown', 'transaction']);
	});

	it('mixes income and expense lines', async () => {
		const outcomes = await parseEntries('+เงินเดือน 30000\nค่าเน็ต 599', now);
		expect(outcomes.map((o) => (o.type === 'transaction' ? o.tx.kind : null))).toEqual(['income', 'expense']);
	});

	it('leaves a single line exactly as it was', async () => {
		const outcomes = await parseEntries('ข้าวเที่ยง 60', now);
		expect(outcomes).toHaveLength(1);
		expect(outcomes[0].type === 'transaction' && outcomes[0].tx.amount).toBe(60);
	});

	it('still treats a one-line command as a command', async () => {
		const outcomes = await parseEntries('ช่วย', now);
		expect(outcomes).toHaveLength(1);
		expect(outcomes[0].type).toBe('command');
	});

	it('does not split several amounts that share one line', async () => {
		// Deliberate: within a line the parser cannot tell a list from a note, so
		// this stays one entry and the confirmation shows what was recorded.
		expect(await amounts('บิล shoppe 3 เดือน 4050 3800 3800')).toEqual([3800]);
	});
});
