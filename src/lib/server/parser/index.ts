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
