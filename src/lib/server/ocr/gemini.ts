import sharp from 'sharp';
import { z } from 'zod';
import { config } from '$lib/server/config';
import { callOpenRouter } from '$lib/server/llm/openrouter';
import { claimLlmCall, recordLlmUsage, releaseLlmCall } from '$lib/server/db/quota';
import { fromBangkok } from '$lib/utils/date';
import { validAmount, validCalendarDate } from '../parser/validation';
import type { SlipOcrResult } from './slip';

/**
 * Vision cost scales with pixel count, so the image is capped and re-encoded
 * before it ever reaches the wire. A bank slip is large text on a plain
 * background; 1024px on the long edge still reads cleanly.
 */
const MAX_EDGE_PX = 1024;
const JPEG_QUALITY = 80;

/** Missing keys and quoted numbers are model noise, not a reason to fail. */
const optionalText = z.string().catch('');

const responseSchema = z.object({
	amount: z.union([z.number(), z.string()]).nullable().catch(null),
	/** `YYYY-MM-DD`, already converted to CE by the prompt. */
	date: z.string().nullable().catch(null),
	/** `HH:MM` in Bangkok time. */
	time: z.string().nullable().catch(null),
	recipient: optionalText,
	sender: optionalText,
	reference: optionalText,
	bank: optionalText,
	text: optionalText,
	confidence: z.object({
		amount: z.number().min(0).max(1),
		date: z.number().min(0).max(1),
		recipient: z.number().min(0).max(1)
	})
});

const PROMPT = [
	'You read Thai bank transfer slips. Reply with a single JSON object and nothing else.',
	'',
	'Fields:',
	'- amount: the transferred amount in Thai baht as a plain number, no currency symbol, no thousands separator. null if unreadable.',
	'- date: the transaction date as YYYY-MM-DD, or null. Thai slips print Buddhist years (2568 = 2025); always convert to the Common Era.',
	'- time: the transaction time as HH:MM in 24-hour Bangkok time, or null.',
	'- recipient: the name of the account or shop receiving the money, as printed. "" if absent.',
	'- sender: the name of the paying account, as printed. "" if absent.',
	'- reference: the transaction/reference number, as printed. "" if absent.',
	'- bank: the bank or wallet that issued the slip. "" if unclear.',
	'- text: every readable line of the slip, newline separated, exactly as printed.',
	'- confidence: numbers from 0 to 1 for amount, date, and recipient. Use 0 when absent or unreadable.',
	'',
	'Never guess a number you cannot read — use null. Never invent a recipient.'
].join('\n');

/**
 * Fast path for reading a slip. Returns null — never throws — whenever the
 * provider is off, the call fails, or the answer fails validation, so the
 * caller can fall back to the local Tesseract reader.
 */
export async function readSlipWithGemini(image: Buffer, userId?: number): Promise<SlipOcrResult | null> {
	// Reads OCR's own settings, not the text parser's: someone can run Claude for
	// categorising messages and Gemini for slips, and the two must not disable
	// each other.
	if (config.ocr.provider === 'tesseract' || config.ocr.vision.transport === 'none') return null;
	if (userId && config.ocr.dailyLimit === 0) return null;
	const claimedAt = new Date();
	if (userId && !(await claimLlmCall(userId, config.ocr.dailyLimit, claimedAt, 'ocr'))) return null;

	try {
		// The same model either way; only the host and the request shape differ.
		const response =
			config.ocr.vision.transport === 'openrouter'
				? await callGateway(await toBase64Jpeg(image))
				: await callGemini(await googleBody(image));
		if (response === null) {
			if (userId) {
				await releaseLlmCall(userId, claimedAt, 'ocr');
				await storeUsage(userId, 0, 0, false, 'provider_error');
			}
			return null;
		}
		const result = toSlipResult(response.text);
		if (userId) await storeUsage(userId, response.inputTokens, response.outputTokens, result !== null, result ? null : 'invalid_output');
		return result;
	} catch (error) {
		if (userId) {
			await releaseLlmCall(userId, claimedAt, 'ocr');
			await storeUsage(userId, 0, 0, false, 'processing_error');
		}
		console.error('[ocr] Gemini slip read failed:', error instanceof Error ? error.message : 'unknown');
		return null;
	}
}

const SLIP_JSON_SCHEMA = {
	type: 'object',
	required: ['amount', 'date', 'time', 'recipient', 'sender', 'reference', 'bank', 'text', 'confidence'],
	properties: {
		amount: { type: ['number', 'null'] },
		date: { type: ['string', 'null'] },
		time: { type: ['string', 'null'] },
		recipient: { type: 'string' }, sender: { type: 'string' }, reference: { type: 'string' },
		bank: { type: 'string' }, text: { type: 'string' },
		confidence: {
			type: 'object', required: ['amount', 'date', 'recipient'],
			properties: {
				amount: { type: 'number', minimum: 0, maximum: 1 },
				date: { type: 'number', minimum: 0, maximum: 1 },
				recipient: { type: 'number', minimum: 0, maximum: 1 }
			}
		}
	}
};

async function storeUsage(userId: number, inputTokens: number, outputTokens: number, success: boolean, errorCode: string | null): Promise<void> {
	try {
		await recordLlmUsage({
			// The transport, not the model family: the same Gemini model costs
			// different money through the gateway, so the bill only adds up if the
			// metrics say which route was taken.
			userId, workflow: 'ocr', provider: config.ocr.vision.transport, model: config.ocr.vision.model,
			inputTokens, outputTokens, success, errorCode
		});
	} catch (error) {
		console.error('[ocr] could not store LLM usage:', error instanceof Error ? error.message : 'unknown');
	}
}

async function toBase64Jpeg(image: Buffer): Promise<string> {
	const prepared = await sharp(image)
		.rotate()
		.resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: JPEG_QUALITY })
		.toBuffer();
	return prepared.toString('base64');
}

function toSlipResult(raw: string): SlipOcrResult | null {
	const json = extractJson(raw);
	if (!json) return null;

	const parsed = responseSchema.safeParse(json);
	if (!parsed.success) {
		console.warn('[ocr] Gemini returned an unexpected shape');
		return null;
	}

	// A slip whose amount we cannot trust is worse than no answer: the caller
	// falls back to Tesseract rather than booking a number nobody checked.
	const amount = toAmount(parsed.data.amount);
	if (amount === null) {
		console.warn('[ocr] Gemini amount missing or out of range');
		return null;
	}

	// The extras ride along in `text` so a later mis-read stays diagnosable
	// without another API call.
	const text = [
		parsed.data.text.trim(),
		parsed.data.bank ? `ธนาคาร: ${parsed.data.bank}` : '',
		parsed.data.sender ? `ผู้โอน: ${parsed.data.sender}` : ''
	]
		.filter(Boolean)
		.join('\n');

	return {
		amount,
		occurredAt: toOccurredAt(parsed.data.date, parsed.data.time),
		recipient: parsed.data.recipient.trim(),
		reference: parsed.data.reference.trim(),
		text,
		// The transport, not the family: this is the field that answers "where did
		// this slip go", and Gemini through the gateway is a second data hop.
		provider: config.ocr.vision.transport === 'openrouter' ? 'openrouter' : 'gemini',
		confidence: parsed.data.confidence
	};
}

function toAmount(value: number | string | null): number | null {
	if (value === null) return null;
	const parsed = typeof value === 'number' ? value : Number(value.replace(/,/g, '').trim());
	if (!Number.isFinite(parsed)) return null;
	const rounded = Math.round(parsed * 100) / 100;
	return validAmount(rounded) ? rounded : null;
}

function toOccurredAt(date: string | null, time: string | null): Date | null {
	const day = date ? /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date.trim()) : null;
	if (!day) return null;

	// The prompt asks for CE, but a model that forgets must not book a payment
	// 543 years out; anything past 2400 can only be a Buddhist year.
	let year = Number(day[1]);
	if (year > 2400) year -= 543;
	const month = Number(day[2]);
	const dayOfMonth = Number(day[3]);
	if (!validCalendarDate(year, month, dayOfMonth)) return null;

	const clock = time ? /^(\d{1,2}):(\d{2})$/.exec(time.trim()) : null;
	// Noon keeps an unknown time inside the right Bangkok day either way.
	const hour = clock ? Number(clock[1]) : 12;
	const minute = clock ? Number(clock[2]) : 0;
	if (hour > 23 || minute > 59) return null;

	return fromBangkok(year, month, dayOfMonth, hour, minute);
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

function googleBody(image: Buffer): Promise<string> {
	return toBase64Jpeg(image).then((data) =>
		JSON.stringify({
			contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data } }] }],
			generationConfig: {
				responseMimeType: 'application/json',
				responseJsonSchema: SLIP_JSON_SCHEMA,
				temperature: 0,
				maxOutputTokens: config.ocr.maxOutputTokens
			}
		})
	);
}

/**
 * The gateway route. Returns null on refusal like its Google counterpart, so
 * the caller's fallback to Tesseract does not need to know which host answered.
 */
async function callGateway(imageBase64: string): Promise<VisionAnswer | null> {
	try {
		return await callOpenRouter({
			apiKey: config.ocr.vision.apiKey,
			model: config.ocr.vision.model,
			prompt: PROMPT,
			imageBase64,
			maxOutputTokens: config.ocr.maxOutputTokens,
			timeoutMs: config.ocr.timeoutMs,
			jsonSchema: { name: 'bank_slip', schema: SLIP_JSON_SCHEMA }
		});
	} catch (error) {
		console.error('[ocr] OpenRouter slip read failed:', error);
		return null;
	}
}

interface VisionAnswer {
	text: string;
	inputTokens: number;
	outputTokens: number;
}

/** Returns the model's text, or null once the call is not worth waiting on. */
async function callGemini(body: string): Promise<VisionAnswer | null> {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.ocr.vision.model}:generateContent`;

	// Exactly one retry: a dropped connection or a timeout is usually transient,
	// while a second failure means Tesseract should take over now.
	for (let attempt = 0; attempt < 2; attempt++) {
		let res: Response;
		try {
			res = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-goog-api-key': config.ocr.vision.apiKey },
				body,
				signal: AbortSignal.timeout(config.ocr.timeoutMs)
			});
		} catch (error) {
			if (attempt === 1) {
				console.error('[ocr] Gemini unreachable:', error);
				return null;
			}
			console.warn('[ocr] Gemini request failed, retrying once:', error);
			continue;
		}

		if (!res.ok) {
			console.error(`[ocr] Gemini ${res.status}: ${briefly(await res.text())}`);
			return null;
		}
		const payload = (await res.json()) as {
			candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
			usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
		};
		return {
			text: (payload.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join(''),
			inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0
		};
	}
	return null;
}

/**
 * Provider error bodies land in the application log, and they are written by
 * someone else: a 401 can carry account identifiers, and a 500 can carry a
 * stack. The status is what diagnoses the problem; the rest is trimmed.
 */
function briefly(body: string): string {
	return body.replace(/s+/g, ' ').slice(0, 200);
}
