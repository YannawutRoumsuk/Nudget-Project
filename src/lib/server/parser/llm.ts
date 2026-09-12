import { z } from 'zod';
import { ALL_CATEGORIES, FALLBACK_CATEGORY, getCategory } from '$lib/categories';
import { config } from '$lib/server/config';
import { bangkokDayKey, bangkokParts, fromBangkok } from '$lib/utils/date';
import type { ParsedTransaction } from './types';
import { validAmount, validCalendarDate } from './validation';

const responseSchema = z.object({
	kind: z.enum(['expense', 'income']),
	amount: z.number().positive().finite(),
	category: z.string(),
	note: z.string().default(''),
	/** `YYYY-MM-DD` in Bangkok time, or null for "the message is about today". */
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null)
});

const CATEGORY_LIST = ALL_CATEGORIES.map(
	(c) => `- ${c.id} (${c.kind}): ${c.nameTh} / ${c.nameEn}`
).join('\n');

function buildPrompt(text: string, now: Date): string {
	return [
		'You extract a single personal-finance entry from a Thai chat message.',
		`Today in Bangkok (UTC+7) is ${bangkokDayKey(now)}.`,
		'',
		'Allowed categories:',
		CATEGORY_LIST,
		'',
		'Rules:',
		'- amount is a positive number of Thai baht; never encode direction in its sign.',
		'- kind is "income" only when money came in; otherwise "expense".',
		'- category must be one of the ids above and must match the chosen kind.',
		'- note is a short Thai label for the entry (<= 40 chars), no amount in it.',
		'- date is YYYY-MM-DD when the message names a day, otherwise null.',
		'- Thai number words count: "ห้าสิบบาท" is 50, "สองพัน" is 2000.',
		'- If the message is not a finance entry at all, reply exactly: NOT_A_TRANSACTION',
		'',
		'Reply with a single JSON object and nothing else.',
		'',
		`Message: ${text}`
	].join('\n');
}

/**
 * Second-stage parser. Only called when the rules could not do the job, so a
 * failure here is expected and non-fatal — the caller falls back to asking the
 * user to rephrase.
 */
export async function parseByLlm(text: string, now: Date): Promise<ParsedTransaction | null> {
	if (config.llm.provider === 'none') return null;

	try {
		const raw =
			config.llm.provider === 'anthropic'
				? await callAnthropic(buildPrompt(text, now))
				: await callGemini(buildPrompt(text, now));
		return raw ? toTransaction(raw, now) : null;
	} catch (error) {
		console.error('[parser] LLM fallback failed:', error);
		return null;
	}
}

function toTransaction(raw: string, now: Date): ParsedTransaction | null {
	if (raw.includes('NOT_A_TRANSACTION')) return null;

	const json = extractJson(raw);
	if (!json) return null;

	const parsed = responseSchema.safeParse(json);
	if (!parsed.success) return null;

	const { kind, amount, note, date } = parsed.data;
	const roundedAmount = Math.round(amount * 100) / 100;
	if (!validAmount(roundedAmount)) return null;
	if (date) {
		const [year, month, day] = date.split('-').map(Number);
		if (!validCalendarDate(year, month, day)) return null;
	}
	// Never trust the model's category id — an unknown one falls back rather
	// than breaking the foreign key.
	const category = getCategory(parsed.data.category);
	const categoryId = category?.kind === kind ? category.id : FALLBACK_CATEGORY[kind];

	return {
		kind,
		amount: roundedAmount,
		categoryId,
		note: note.slice(0, 120).trim(),
		occurredAt: date ? dayKeyToInstant(date, now) : now,
		parsedBy: 'llm'
	};
}

/** Models like to wrap JSON in prose or fences; take the outermost object. */
function extractJson(raw: string): unknown {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start === -1 || end <= start) return null;
	try {
		return JSON.parse(raw.slice(start, end + 1));
	} catch {
		return null;
	}
}

function dayKeyToInstant(dayKey: string, now: Date): Date {
	const [year, month, day] = dayKey.split('-').map(Number);
	const today = bangkokParts(now);
	const sameDay = today.year === year && today.month === month && today.day === day;
	return sameDay ? now : fromBangkok(year, month, day, 12, 0);
}

// ------------------------------------------------------------- providers ---

const TIMEOUT_MS = 10_000;

async function callAnthropic(prompt: string): Promise<string> {
	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': config.llm.apiKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: config.llm.model,
			max_tokens: 400,
			messages: [{ role: 'user', content: prompt }]
		}),
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});

	if (!res.ok) throw new Error(`Anthropic ${res.status}: ${briefly(await res.text())}`);
	const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
	return (body.content ?? [])
		.filter((block) => block.type === 'text')
		.map((block) => block.text ?? '')
		.join('');
}

async function callGemini(prompt: string): Promise<string> {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.llm.model}:generateContent`;
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-goog-api-key': config.llm.apiKey },
		body: JSON.stringify({
			contents: [{ parts: [{ text: prompt }] }],
			generationConfig: { temperature: 0, maxOutputTokens: 400 }
		}),
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});

	if (!res.ok) throw new Error(`Gemini ${res.status}: ${briefly(await res.text())}`);
	const body = (await res.json()) as {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
	};
	return (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

/**
 * Provider error bodies land in the application log, and they are written by
 * someone else: a 401 can carry account identifiers, and a 500 can carry a
 * stack. The status is what diagnoses the problem; the rest is trimmed.
 */
function briefly(body: string): string {
	return body.replace(/s+/g, ' ').slice(0, 200);
}
