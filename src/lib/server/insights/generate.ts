import { z } from 'zod';
import { categoryLabel } from '$lib/categories';
import { config } from '$lib/server/config';
import { callOpenRouter } from '$lib/server/llm/openrouter';
import { recordLlmUsage } from '$lib/server/db/quota';
import type { InsightInput } from './input';

export interface SavingIdea {
	title: string;
	detail: string;
	/** Estimated baht saved per month. 0 when the model would not commit. */
	monthlySaving: number;
}

export interface Insight {
	headline: string;
	summary: string;
	observations: string[];
	savings: SavingIdea[];
}

/**
 * Lengths are part of the contract, not a suggestion: the page lays these out
 * in fixed slots, and a model that ignores the prompt must not be able to push
 * a wall of text into a card.
 */
const MAX_HEADLINE = 80;
const MAX_SUMMARY = 400;
const MAX_OBSERVATION = 200;
const MAX_OBSERVATIONS = 5;
const MAX_TITLE = 60;
const MAX_DETAIL = 240;
const MAX_IDEAS = 4;

/**
 * The shape the page renders. Also the gate on rows read back out of the
 * database — stored JSON is data, not truth, so it passes through here again.
 */
export const insightSchema: z.ZodType<Insight> = z.object({
	headline: z.string().min(1).max(MAX_HEADLINE),
	summary: z.string().min(1).max(MAX_SUMMARY),
	observations: z.array(z.string().min(1).max(MAX_OBSERVATION)).max(MAX_OBSERVATIONS),
	savings: z
		.array(
			z.object({
				title: z.string().min(1).max(MAX_TITLE),
				detail: z.string().max(MAX_DETAIL),
				monthlySaving: z.number().finite().min(0)
			})
		)
		.max(MAX_IDEAS)
});

/** Missing keys and quoted numbers are model noise, not a reason to fail. */
const savingResponseSchema = z.object({
	title: z.string(),
	detail: z.string().catch(''),
	monthlySaving: z.union([z.number(), z.string()]).nullable().catch(null)
});

const responseSchema = z.object({
	headline: z.string().catch(''),
	summary: z.string().catch(''),
	observations: z.array(z.unknown()).catch([]),
	savings: z.array(z.unknown()).catch([])
});

/**
 * The analysis had no schema on either route, which left the shape resting on
 * the prompt alone. A model that answers with different field names produces a
 * reply the tolerant zod parse turns into nothing usable, and the page then
 * says it cannot analyse the month — indistinguishable from the model failing.
 */
const INSIGHT_JSON_SCHEMA = {
	type: 'object',
	required: ['headline', 'summary', 'observations', 'savings'],
	properties: {
		headline: { type: 'string' },
		summary: { type: 'string' },
		observations: { type: 'array', items: { type: 'string' } },
		savings: {
			type: 'array',
			items: {
				type: 'object',
				required: ['title', 'detail', 'monthlySaving'],
				properties: {
					title: { type: 'string' },
					detail: { type: 'string' },
					monthlySaving: { type: 'number' }
				}
			}
		}
	}
};

const TIMEOUT_MS = 20_000;
const MAX_TOKENS = 600;

interface ProviderResult {
	text: string;
	inputTokens: number;
	outputTokens: number;
}

/**
 * Writes one month's review. Returns null — never throws — when the provider is
 * off, the call fails, or validation leaves nothing usable, because the page
 * has the charts either way and commentary is the part that is allowed to be
 * missing.
 */
export async function generateInsight(input: InsightInput, userId: number): Promise<Insight | null> {
	if (config.llm.provider === 'none') return null;

	try {
		const prompt = buildPrompt(input);
		const result =
			config.llm.provider === 'anthropic'
				? await callAnthropic(prompt)
				: config.llm.provider === 'openrouter'
					? await callGateway(prompt)
					: await callGemini(prompt);
		if (result === null) {
			await saveUsage(userId, false, 0, 0, 'provider_error');
			return null;
		}
		const insight = toInsight(result.text, input);
		await saveUsage(userId, insight !== null, result.inputTokens, result.outputTokens, insight ? null : 'invalid_output');
		return insight;
	} catch (error) {
		console.error('[insights] analysis failed:', error);
		await saveUsage(userId, false, 0, 0, 'unexpected_error');
		return null;
	}
}

/**
 * Metrics are best-effort, the analysis is not: a metrics table that refuses a
 * row must not cost someone the paragraph they already paid for. `userId` is
 * required rather than optional so a future caller cannot quietly stop counting.
 */
async function saveUsage(
	userId: number,
	success: boolean,
	inputTokens: number,
	outputTokens: number,
	errorCode: string | null
): Promise<void> {
	try {
		await recordLlmUsage({
			userId,
			workflow: 'insights',
			provider: config.llm.provider,
			model: config.llm.model,
			inputTokens,
			outputTokens,
			success,
			errorCode
		});
	} catch (error) {
		console.error('[insights] could not store token metrics:', error);
	}
}

/**
 * Only the aggregates in `InsightInput` are ever put on the wire: no individual
 * transactions, no notes, no merchant or recipient names, no display name, no
 * LINE id. That is a privacy line first — a month of someone's spending is not
 * ours to hand to a third party in detail — and it is also why the prompt stays
 * a few hundred tokens instead of a few thousand.
 */
function buildPrompt(input: InsightInput): string {
	return [
		'You write a short monthly money review for one person, about their own spending.',
		'',
		'Voice:',
		'- Write in Thai, speaking to the person directly.',
		'- Warm and concrete. Never preachy, never moralising about what they chose to buy.',
		'- Every claim must follow from the numbers below, and must cite the figure it came from.',
		'- You only have totals. Never invent a transaction, a shop, or a reason for a number.',
		'',
		'Fields:',
		`- headline: one line, at most ${MAX_HEADLINE} characters, naming the single most useful fact about the month.`,
		`- summary: at most ${MAX_SUMMARY} characters. How the month went against last month and against the plan, if there is one.`,
		`- observations: at most ${MAX_OBSERVATIONS} strings, each at most ${MAX_OBSERVATION} characters, each citing a number.`,
		`- savings: at most ${MAX_IDEAS} ideas. Each is { title, detail, monthlySaving }.`,
		`  - title: at most ${MAX_TITLE} characters.`,
		`  - detail: at most ${MAX_DETAIL} characters, saying which category it comes out of and how.`,
		'  - monthlySaving: baht saved per month as a plain number. Use 0 when you cannot commit to a figure.',
		'',
		'Savings rules:',
		'- Tie every idea to one of the expense categories listed below, by its Thai name.',
		'- The figure must be realistic against what that category actually costs this month.',
		'- Never propose saving more than the category currently costs.',
		'- "ใช้จ่ายให้น้อยลง" is not an idea. Name the change and the amount.',
		'',
		'Reply with a single JSON object and nothing else.',
		'',
		buildFacts(input)
	].join('\n');
}

function buildFacts(input: InsightInput): string {
	const lines = [
		`เดือน: ${input.monthLabel}`,
		`ผ่านไปแล้ว ${input.daysElapsed} วัน จากทั้งเดือน ${input.daysInMonth} วัน`,
		`รายรับ: ${input.income} บาท (เดือนก่อน ${input.previousIncome} บาท)`,
		`รายจ่าย: ${input.expense} บาท (เดือนก่อน ${input.previousExpense} บาท)`,
		`คงเหลือ: ${input.net} บาท`,
		`อัตราออม: ${input.savingsRate === null ? 'คำนวณไม่ได้เพราะไม่มีรายรับ' : `${input.savingsRate}%`} (${input.savings} บาท)`,
		`ยอดใช้บัตรเครดิต: ${input.creditCardSpent} บาท`,
		`งบที่เหลือหลังกันเงินออมและบิล: ${input.remainingBudget === null ? 'ยังไม่ได้ตั้งแผน' : `${input.remainingBudget} บาท`}`,
		`จำนวนรายการที่บันทึก: ${input.transactionCount}`,
		`บิลที่ยังไม่จ่ายในเดือนนี้: ${input.unpaidBills} บาท`,
		input.busiestDay
			? `วันที่ใช้จ่ายมากที่สุด: ${input.busiestDay.day} จำนวน ${input.busiestDay.expense} บาท`
			: 'วันที่ใช้จ่ายมากที่สุด: ไม่มีรายจ่ายในเดือนนี้',
		input.plan
			? `แผนที่ตั้งไว้: รายรับคาดหวัง ${input.plan.expectedIncome} บาท, เป้าเงินเก็บ ${input.plan.savingsGoal} บาท, ค่าอาหารวันละ ${input.plan.foodDailyBudget} บาท, ค่าเดินทางวันละ ${input.plan.commuteDailyBudget} บาท x ${input.plan.commuteDays} วัน`
			: 'แผนที่ตั้งไว้: ยังไม่ได้ตั้งแผนเดือนนี้',
		'',
		'รายจ่ายแยกตามหมวด — เดือนนี้ / เดือนก่อน / ส่วนต่าง (บาท):'
	];

	for (const change of input.categories) {
		const sign = change.delta > 0 ? '+' : '';
		lines.push(`- ${categoryLabel(change.categoryId)}: ${change.current} / ${change.previous} / ${sign}${change.delta}`);
	}
	if (input.categories.length === 0) lines.push('- ยังไม่มีรายจ่ายในสองเดือนนี้');

	return lines.join('\n');
}

function toInsight(raw: string, input: InsightInput): Insight | null {
	const json = extractJson(raw);
	if (!json) return null;

	const parsed = responseSchema.safeParse(json);
	if (!parsed.success) {
		console.warn('[insights] model returned an unexpected shape');
		return null;
	}

	// A single bad observation or an over-eager saving figure is not a reason to
	// throw the whole month away, so each entry is dropped on its own and the
	// rest still reaches the page.
	const candidate = {
		headline: clamp(parsed.data.headline, MAX_HEADLINE),
		summary: clamp(parsed.data.summary, MAX_SUMMARY),
		observations: parsed.data.observations
			.filter((line): line is string => typeof line === 'string')
			.map((line) => clamp(line, MAX_OBSERVATION))
			.filter(Boolean)
			.slice(0, MAX_OBSERVATIONS),
		savings: toSavings(parsed.data.savings, input.expense)
	};

	const insight = insightSchema.safeParse(candidate);
	if (!insight.success) {
		console.warn('[insights] nothing usable survived validation');
		return null;
	}
	// Numbers with no words around them are worse than silence.
	if (insight.data.observations.length === 0 && insight.data.savings.length === 0) return null;
	return insight.data;
}

function toSavings(entries: unknown[], monthExpense: number): SavingIdea[] {
	const ideas: SavingIdea[] = [];

	for (const entry of entries) {
		const parsed = savingResponseSchema.safeParse(entry);
		if (!parsed.success) continue;

		const title = clamp(parsed.data.title, MAX_TITLE);
		if (!title) continue;

		// An idea that claims to save more than the whole month cost is arithmetic
		// the person can check in one glance, and getting it wrong costs the rest
		// of the analysis its credibility.
		const monthlySaving = toMonthlySaving(parsed.data.monthlySaving);
		if (monthlySaving === null || monthlySaving > monthExpense) continue;

		ideas.push({ title, detail: clamp(parsed.data.detail, MAX_DETAIL), monthlySaving });
		if (ideas.length === MAX_IDEAS) break;
	}

	return ideas;
}

function toMonthlySaving(value: number | string | null): number | null {
	if (value === null) return 0;
	const parsed = typeof value === 'number' ? value : Number(value.replace(/,/g, '').trim());
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	return Math.round(parsed * 100) / 100;
}

function clamp(value: string, limit: number): string {
	return value.trim().slice(0, limit).trim();
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

// ------------------------------------------------------------- providers ---

/** Returns the model's text, or null once the call is not worth waiting on. */
async function callAnthropic(prompt: string): Promise<ProviderResult | null> {
	const res = await request('https://api.anthropic.com/v1/messages', {
		'content-type': 'application/json',
		'x-api-key': config.llm.apiKey,
		'anthropic-version': '2023-06-01'
	}, JSON.stringify({
		model: config.llm.model,
		max_tokens: MAX_TOKENS,
		messages: [{ role: 'user', content: prompt }]
	}));
	if (!res) return null;

	const body = (await res.json()) as {
		content?: Array<{ type: string; text?: string }>;
		usage?: { input_tokens?: number; output_tokens?: number };
	};
	return {
		text: (body.content ?? [])
		.filter((block) => block.type === 'text')
		.map((block) => block.text ?? '')
		.join(''),
		inputTokens: body.usage?.input_tokens ?? 0,
		outputTokens: body.usage?.output_tokens ?? 0
	};
}

async function callGemini(prompt: string): Promise<ProviderResult | null> {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.llm.model}:generateContent`;
	const res = await request(url, {
		'content-type': 'application/json',
		'x-goog-api-key': config.llm.apiKey
	}, JSON.stringify({
		contents: [{ parts: [{ text: prompt }] }],
		generationConfig: {
			responseMimeType: 'application/json',
			responseJsonSchema: INSIGHT_JSON_SCHEMA,
			temperature: 0.3,
			maxOutputTokens: MAX_TOKENS
		}
	}));
	if (!res) return null;

	const body = (await res.json()) as {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
		usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
	};
	return {
		text: (body.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join(''),
		inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
		outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0
	};
}

/**
 * Exactly one retry: a dropped connection or a timeout is usually transient,
 * while a second failure means the page should render without commentary now
 * rather than keep someone waiting on a paragraph.
 */
/**
 * The gateway route. Returns null on a refusal like the other two, so the page
 * shows its charts without commentary rather than an error.
 */
async function callGateway(prompt: string): Promise<ProviderResult | null> {
	try {
		return await callOpenRouter({
			apiKey: config.llm.apiKey,
			model: config.llm.model,
			prompt,
			maxOutputTokens: MAX_TOKENS,
			timeoutMs: TIMEOUT_MS,
			jsonSchema: { name: 'monthly_review', schema: INSIGHT_JSON_SCHEMA }
		});
	} catch (error) {
		console.error('[insights] OpenRouter refused:', error instanceof Error ? error.message : 'unknown');
		return null;
	}
}

async function request(url: string, headers: Record<string, string>, body: string): Promise<Response | null> {
	for (let attempt = 0; attempt < 2; attempt++) {
		let res: Response;
		try {
			res = await fetch(url, {
				method: 'POST',
				headers,
				body,
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});
		} catch (error) {
			if (attempt === 1) {
				console.error('[insights] provider unreachable:', error);
				return null;
			}
			console.warn('[insights] request failed, retrying once:', error);
			continue;
		}

		if (!res.ok) {
			console.error(`[insights] provider ${res.status}: ${briefly(await res.text())}`);
			return null;
		}
		return res;
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
