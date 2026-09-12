import { z } from 'zod';
import { ALL_CATEGORIES, FALLBACK_CATEGORY, getCategory } from '$lib/categories';
import { config } from '$lib/server/config';
import { claimLlmCall, recordLlmUsage, releaseLlmCall } from '$lib/server/db/quota';
import { bangkokDayKey, bangkokParts, fromBangkok } from '$lib/utils/date';
import type { ParsedTransaction } from './types';
import { validAmount, validCalendarDate } from './validation';

const responseSchema = z.object({
	isTransaction: z.boolean(),
	kind: z.enum(['expense', 'income']).nullable(),
	amount: z.number().positive().finite().nullable(),
	category: z.string().nullable(),
	note: z.string().default(''),
	paymentMethod: z.enum(['bank', 'cash', 'credit_card', 'wallet']).default('bank'),
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
		'- paymentMethod is bank, cash, credit_card, or wallet. Use bank when unspecified.',
		'- date is YYYY-MM-DD when the message names a day, otherwise null.',
		'- Thai number words count: "ห้าสิบบาท" is 50, "สองพัน" is 2000.',
		'- isTransaction is false when the message is not a finance entry; then use null for kind, amount, and category.',
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
export async function parseByLlm(text: string, now: Date, userId?: number): Promise<ParsedTransaction | null> {
	if (config.llm.provider === 'none' || !userId || config.llm.parserDailyLimit === 0) return null;
	if (text.length > config.llm.maxInputChars) return null;
	if (!(await claimLlmCall(userId, config.llm.parserDailyLimit, now, 'parser'))) return null;

	try {
		const response =
			config.llm.provider === 'anthropic'
				? await callAnthropic(buildPrompt(text, now))
				: await callGemini(buildPrompt(text, now));
		const result = response.text ? toTransaction(response.text, now) : null;
		await storeUsage({ userId, ...response.usage, success: result !== null, errorCode: result ? null : 'invalid_output' });
		return result;
	} catch (error) {
		await releaseLlmCall(userId, now, 'parser');
		await storeUsage({ userId, inputTokens: 0, outputTokens: 0, success: false, errorCode: errorCode(error) });
		console.error('[parser] LLM fallback failed:', error instanceof Error ? error.message : 'unknown');
		return null;
	}
}

interface ProviderUsage {
	inputTokens: number;
	outputTokens: number;
}

interface ProviderResponse {
	text: string;
	usage: ProviderUsage;
}

async function storeUsage(values: { userId: number; inputTokens: number; outputTokens: number; success: boolean; errorCode: string | null }): Promise<void> {
	try {
		await recordLlmUsage({
			...values,
			workflow: 'parser',
			provider: config.llm.provider,
			model: config.llm.model
		});
	} catch (error) {
		console.error('[parser] could not store LLM usage:', error instanceof Error ? error.message : 'unknown');
	}
}

function errorCode(error: unknown): string {
	if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
	const match = error instanceof Error ? /provider_(\d{3})/.exec(error.message) : null;
	return match ? `http_${match[1]}` : 'network';
}

function toTransaction(raw: string, now: Date): ParsedTransaction | null {
	const json = extractJson(raw);
	if (!json) return null;

	const parsed = responseSchema.safeParse(json);
	if (!parsed.success) return null;

	const { isTransaction, kind, amount, note, date, paymentMethod } = parsed.data;
	if (!isTransaction || kind === null || amount === null || parsed.data.category === null) return null;
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
		parsedBy: 'llm',
		paymentMethod
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

async function callAnthropic(prompt: string): Promise<ProviderResponse> {
	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': config.llm.apiKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: config.llm.model,
			max_tokens: config.llm.maxOutputTokens,
			messages: [{ role: 'user', content: prompt }]
		}),
		signal: AbortSignal.timeout(config.llm.timeoutMs)
	});

	if (!res.ok) throw new Error(`provider_${res.status}`);
	const body = (await res.json()) as {
		content?: Array<{ type: string; text?: string }>;
		usage?: { input_tokens?: number; output_tokens?: number };
	};
	return { text: (body.content ?? [])
		.filter((block) => block.type === 'text')
		.map((block) => block.text ?? '')
		.join(''), usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 } };
}

async function callGemini(prompt: string): Promise<ProviderResponse> {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.llm.model}:generateContent`;
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-goog-api-key': config.llm.apiKey },
		body: JSON.stringify({
			contents: [{ parts: [{ text: prompt }] }],
			generationConfig: {
				responseMimeType: 'application/json',
				responseJsonSchema: {
					type: 'object',
					required: ['isTransaction', 'kind', 'amount', 'category', 'note', 'date', 'paymentMethod'],
					properties: {
						isTransaction: { type: 'boolean' },
						kind: { anyOf: [{ type: 'string', enum: ['expense', 'income'] }, { type: 'null' }] },
						amount: { type: ['number', 'null'] },
						category: { type: ['string', 'null'] },
						note: { type: 'string' },
						date: { type: ['string', 'null'] },
						paymentMethod: { type: 'string', enum: ['bank', 'cash', 'credit_card', 'wallet'] }
					}
				},
				temperature: 0,
				maxOutputTokens: config.llm.maxOutputTokens
			}
		}),
		signal: AbortSignal.timeout(config.llm.timeoutMs)
	});

	if (!res.ok) throw new Error(`provider_${res.status}`);
	const body = (await res.json()) as {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
		usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
	};
	return {
		text: (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
		usage: {
			inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0
		}
	};
}
