import { parseByLlm } from './llm';
import { extractDate, extractPaymentMethod, matchCommand, normalize, parseByRules } from './rules';
import type { ParseOutcome } from './types';

export * from './types';
export { matchCommand, normalize, parseByRules } from './rules';

/**
 * Hybrid parse: rules first because they are free and instant, LLM only for the
 * messages the rules could not confidently handle.
 *
 * The LLM is consulted in two cases:
 *  1. no amount was found at all (e.g. "จ่ายค่าข้าวไปห้าสิบบาท")
 *  2. an amount was found but no keyword matched a category, so the rules would
 *     have dumped it into "อื่นๆ"
 */
export async function parseMessage(rawText: string, now = new Date()): Promise<ParseOutcome> {
	const command = matchCommand(rawText);
	if (command) return { type: 'command', command };
	if (extractDate(normalize(rawText), now).invalid) return { type: 'unknown', text: rawText };

	const ruled = parseByRules(rawText, now);
	if (ruled?.categoryMatched) return { type: 'transaction', tx: ruled.tx };

	const guessed = await parseByLlm(rawText, now);
	if (guessed) return { type: 'transaction', tx: { ...guessed, paymentMethod: extractPaymentMethod(rawText).paymentMethod } };

	// LLM unavailable or unhelpful: an uncategorised rule hit still beats
	// throwing the entry away.
	if (ruled) return { type: 'transaction', tx: ruled.tx };
	return { type: 'unknown', text: rawText };
}

/**
 * Reads a message that holds one entry per line.
 *
 * A line break is the only separator worth trusting. Inside a line a bare
 * number can belong to the note — "ข้าว 2 จาน 120" is one plate order, not two
 * entries — so splitting on spaces would invent entries that nobody typed.
 * `normalize` flattens whitespace, which is why the split has to happen here,
 * before the text reaches it.
 *
 * Falls back to reading the whole message as one entry unless at least two
 * lines actually carry money: a note that happens to wrap over several lines
 * must not turn into a list.
 */
export async function parseEntries(rawText: string, now = new Date()): Promise<ParseOutcome[]> {
	const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	if (lines.length < 2) return [await parseMessage(rawText, now)];

	const perLine = await Promise.all(lines.map((line) => parseMessage(line, now)));
	if (perLine.filter((outcome) => outcome.type === 'transaction').length < 2) {
		return [await parseMessage(rawText, now)];
	}
	return perLine;
}
