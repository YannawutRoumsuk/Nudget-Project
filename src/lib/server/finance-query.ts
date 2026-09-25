import { z } from 'zod';
import { ALL_CATEGORIES } from '$lib/categories';
import { config } from '$lib/server/config';
import { getFinanceQueryAggregate } from '$lib/server/db/queries';
import { claimLlmCall, recordLlmUsage, releaseLlmCall } from '$lib/server/db/quota';
import { callOpenRouter } from '$lib/server/llm/openrouter';
import { bangkokDayKey, bangkokParts, fromBangkok } from '$lib/utils/date';
import { formatNumber } from '$lib/utils/money';
import type { PaymentMethod, TxKind } from '$lib/server/db/schema';

const METHODS: PaymentMethod[] = ['bank', 'cash', 'credit_card', 'shopee_paylater', 'wallet'];
const CATEGORY_IDS = ALL_CATEGORIES.map((category) => category.id);
const intentSchema = z.object({
	intent: z.enum(['query', 'clarify', 'unsupported']),
	kind: z.enum(['expense', 'income', 'both']),
	fromDate: z.string().nullable(),
	toDate: z.string().nullable(),
	compareFromDate: z.string().nullable(),
	compareToDate: z.string().nullable(),
	categoryIds: z.array(z.string()).max(3),
	paymentMethod: z.string().nullable(),
	groupBy: z.enum(['none', 'category', 'paymentMethod'])
}).strict();

const QUERY_JSON_SCHEMA = {
	type: 'object', additionalProperties: false,
	required: ['intent', 'kind', 'fromDate', 'toDate', 'compareFromDate', 'compareToDate', 'categoryIds', 'paymentMethod', 'groupBy'],
	properties: {
		intent: { type: 'string', enum: ['query', 'clarify', 'unsupported'] },
		kind: { type: 'string', enum: ['expense', 'income', 'both'] },
		fromDate: { type: ['string', 'null'] }, toDate: { type: ['string', 'null'] },
		compareFromDate: { type: ['string', 'null'] }, compareToDate: { type: ['string', 'null'] },
		categoryIds: { type: 'array', items: { type: 'string', enum: CATEGORY_IDS } },
		paymentMethod: { anyOf: [{ type: 'string', enum: METHODS }, { type: 'null' }] },
		groupBy: { type: 'string', enum: ['none', 'category', 'paymentMethod'] }
	}
};

type QueryIntent = z.infer<typeof intentSchema>;
type Summary = Awaited<ReturnType<typeof getFinanceQueryAggregate>>;

/** Uses the model only to choose a bounded query; all financial results come from SQL. */
export async function answerFinanceQuestion(userId: number, rawQuestion: string, now = new Date()): Promise<string> {
	const question = rawQuestion.trim().slice(0, 300);
	if (!question) return 'พิมพ์คำถามการเงินที่อยากรู้ เช่น “อาทิตย์นี้กินข้าวไปเท่าไร”';
	if (config.llm.provider === 'none' || config.llm.helpDailyLimit === 0) return 'ตอนนี้ยังไม่ได้เปิด AI สำหรับแปลงคำถาม ลองดูยอดจากคำสั่ง “วันนี้” หรือ “เดือนนี้” ได้';
	let claimed = false;
	let usageRecorded = false;
	try {
		claimed = await claimLlmCall(userId, config.llm.helpDailyLimit, now, 'finance_query');
		if (!claimed) return `วันนี้ถามยอดด้วย AI ครบ ${config.llm.helpDailyLimit} ครั้งแล้ว พรุ่งนี้ถามใหม่ได้`;
		const result = await classify(question, now);
		const parsed = intentSchema.safeParse(result.text ? extractJson(result.text) : null);
		if (!parsed.success) {
			await saveUsage(userId, false, result.inputTokens, result.outputTokens, 'invalid_intent');
			usageRecorded = true;
			throw new Error('invalid_intent');
		}
		await saveUsage(userId, true, result.inputTokens, result.outputTokens, null);
		usageRecorded = true;
		const query = validateIntent(parsed.data, now);
		if (query.intent === 'clarify') return 'อยากดูช่วงไหน หรือหมวดไหนครับ? ตัวอย่าง: “วันนี้จ่ายค่าเดินทางไปเท่าไร” หรือ “เดือนนี้กินไปเท่าไร”';
		if (query.intent === 'unsupported') return 'ตอนนี้ตอบได้เฉพาะยอดรายรับ/รายจ่ายตามช่วงเวลา หมวด วิธีจ่าย และเปรียบเทียบช่วงก่อน เช่น “เดือนนี้ค่าเดินทางเทียบเดือนก่อน”';
		const current = await getFinanceQueryAggregate(userId, query);
		const comparison = query.compareRange ? await getFinanceQueryAggregate(userId, { ...query, ...query.compareRange }) : null;
		return formatAnswer(query, current, comparison, config.publicBaseUrl);
	} catch (error) {
		if (claimed) {
			try { await releaseLlmCall(userId, now, 'finance_query'); }
			catch (refundError) { console.error('[finance-query] quota refund failed:', refundError); }
			if (!usageRecorded) await saveUsage(userId, false, 0, 0, errorCode(error));
		}
		console.error('[finance-query] query failed:', error);
		return 'ตอนนี้ค้นยอดให้ไม่ได้ ลองพิมพ์ “วันนี้” หรือ “เดือนนี้” ได้';
	}
}

interface ValidQuery extends Omit<QueryIntent, 'fromDate' | 'toDate' | 'compareFromDate' | 'compareToDate' | 'paymentMethod' | 'intent'> {
	intent: 'query';
	from: Date;
	to: Date;
	compareRange: { from: Date; to: Date } | null;
	categoryIds: string[];
	paymentMethod: PaymentMethod | null;
	kind: TxKind | 'both';
}

function validateIntent(intent: QueryIntent, now: Date): ValidQuery | { intent: 'clarify' } | { intent: 'unsupported' } {
	if (intent.intent !== 'query') return { intent: intent.intent };
	if (!validDay(intent.fromDate) || !validDay(intent.toDate) || intent.fromDate >= intent.toDate) return { intent: 'clarify' };
	const from = dateStart(intent.fromDate);
	const to = dateStart(intent.toDate);
	const days = (to.getTime() - from.getTime()) / 86_400_000;
	if (days < 1 || days > 366 || from.getTime() > now.getTime() + 86_400_000) return { intent: 'clarify' };
	let compareRange: { from: Date; to: Date } | null = null;
	if (intent.compareFromDate || intent.compareToDate) {
		if (!validDay(intent.compareFromDate) || !validDay(intent.compareToDate) || intent.compareFromDate >= intent.compareToDate) return { intent: 'clarify' };
		const compareFrom = dateStart(intent.compareFromDate);
		const compareTo = dateStart(intent.compareToDate);
		const comparisonDays = (compareTo.getTime() - compareFrom.getTime()) / 86_400_000;
		if (comparisonDays < 1 || comparisonDays > 366 || compareTo > from) return { intent: 'clarify' };
		compareRange = { from: compareFrom, to: compareTo };
	}
	if (intent.categoryIds.some((id) => !CATEGORY_IDS.includes(id))) return { intent: 'clarify' };
	if (intent.kind !== 'both' && intent.categoryIds.some((id) => ALL_CATEGORIES.find((category) => category.id === id)?.kind !== intent.kind)) return { intent: 'clarify' };
	if (intent.paymentMethod && !METHODS.includes(intent.paymentMethod as PaymentMethod)) return { intent: 'clarify' };
	return {
		...intent,
		from, to, compareRange,
		categoryIds: intent.categoryIds,
		paymentMethod: intent.paymentMethod as PaymentMethod | null
	};
}

async function classify(question: string, now: Date) {
	const categories = ALL_CATEGORIES.map((category) => `${category.id}: ${category.nameTh}`).join('\n');
	const prompt = [
		'แปลงคำถามการเงินของเจ้าของบัญชี Nudget เป็น JSON intent สำหรับ query ที่ปลอดภัยเท่านั้น ห้ามตอบยอดหรือแต่งข้อมูล',
		`วันที่วันนี้ตามเวลา Asia/Bangkok คือ ${bangkokDayKey(now)}.`,
		'ช่วงวันที่ใช้ fromDate รวมวันนั้น และ toDate ไม่รวมวันนั้น รูปแบบ YYYY-MM-DD; ค้นได้ไม่เกิน 366 วันต่อช่วง. ถ้าเปรียบเทียบให้กำหนด compareFromDate/compareToDate เป็นช่วงจริงที่ต้องการเทียบและจบก่อนช่วงหลัก',
		'คำถามไม่ชัดช่วงเวลาหรือขอข้อมูลที่ไม่ได้รองรับให้ intent=clarify; เรื่องไม่เกี่ยวกับยอดรายรับ/รายจ่ายให้ intent=unsupported.',
		'ใช้ kind=expense สำหรับค่าใช้จ่าย, income สำหรับรายรับ, both เมื่อต้องดูทั้งคู่. groupBy เป็น category/paymentMethod เมื่อถามแยกหมวดหรือวิธีจ่าย.',
		`หมวดที่อนุญาต: ${categories}`,
		`วิธีจ่ายที่อนุญาต: ${METHODS.join(', ')}`,
		'ถ้าไม่ได้เจาะจงหมวดหรือวิธีจ่าย ให้ categoryIds=[] และ paymentMethod=null. อย่าสร้าง SQL หรือคืนข้อความคำตอบ.',
		`คำถาม: ${question}`,
		'คืนเฉพาะ JSON ตาม schema ที่กำหนด'
	].join('\n');
	if (config.llm.provider === 'openrouter') {
		const answer = await callOpenRouter({ apiKey: config.llm.apiKey, model: config.llm.model, prompt, maxOutputTokens: 180, timeoutMs: config.llm.timeoutMs, reasoning: { effort: 'minimal', exclude: true }, jsonSchema: { name: 'finance_query', schema: QUERY_JSON_SCHEMA } });
		return { text: answer.text, inputTokens: answer.inputTokens, outputTokens: answer.outputTokens };
	}
	if (config.llm.provider === 'gemini') {
		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.llm.model}:generateContent`, {
			method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': config.llm.apiKey },
			body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: QUERY_JSON_SCHEMA, temperature: 0, maxOutputTokens: 180 } }),
			signal: AbortSignal.timeout(config.llm.timeoutMs)
		});
		if (!response.ok) throw new Error(`provider_${response.status}`);
		const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
		return { text: (body.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join(''), inputTokens: body.usageMetadata?.promptTokenCount ?? 0, outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0 };
	}
	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': config.llm.apiKey, 'anthropic-version': '2023-06-01' },
		body: JSON.stringify({ model: config.llm.model, max_tokens: 180, messages: [{ role: 'user', content: prompt }] }),
		signal: AbortSignal.timeout(config.llm.timeoutMs)
	});
	if (!response.ok) throw new Error(`provider_${response.status}`);
	const body = await response.json() as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
	return { text: (body.content ?? []).filter((part) => part.type === 'text').map((part) => part.text ?? '').join(''), inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 };
}

function formatAnswer(query: ValidQuery, result: Summary, comparison: Summary | null, baseUrl: string): string {
	const kindLabel = query.kind === 'income' ? 'รายรับ' : query.kind === 'expense' ? 'รายจ่าย' : 'ภาพรวม';
	const total = query.kind === 'income' ? result.totals.income : query.kind === 'expense' ? result.totals.expense : result.totals.net;
	const lines = query.kind === 'both'
		? [`${kindLabel} ${formatRange(query.from, query.to)}: รับ ฿${formatNumber(result.totals.income)} · จ่าย ฿${formatNumber(result.totals.expense)} · สุทธิ ฿${formatNumber(result.totals.net)} จาก ${result.totals.count} รายการ`]
		: [`${kindLabel} ${formatRange(query.from, query.to)}: ฿${formatNumber(total)} จาก ${result.totals.count} รายการ`];
	if (query.groupBy !== 'none') {
		const labels = query.groupBy === 'category' ? new Map(ALL_CATEGORIES.map((category) => [category.id, category.nameTh])) : new Map<string, string>([['bank', 'บัญชีธนาคาร'], ['cash', 'เงินสด'], ['credit_card', 'บัตรเครดิต'], ['shopee_paylater', 'Shopee PayLater'], ['wallet', 'กระเป๋าเงิน']]);
		const parts = result.breakdown.slice(0, 4).map((item) => `${labels.get(item.key) ?? item.key} ${formatNumber(item.amount)}`);
		if (parts.length) lines.push(`แยกตาม${query.groupBy === 'category' ? 'หมวด' : 'วิธีจ่าย'}: ${parts.join(' · ')}`);
	}
	if (comparison) {
		const previous = query.kind === 'income' ? comparison.totals.income : query.kind === 'expense' ? comparison.totals.expense : comparison.totals.net;
		const difference = total - previous;
		const comparedRange = query.compareRange ? ` (${formatRange(query.compareRange.from, query.compareRange.to)})` : '';
		lines.push(`เทียบช่วงก่อน${comparedRange} ${formatNumber(previous)} บาท (${difference > 0 ? '+' : ''}${formatNumber(difference)} บาท)`);
	}
	if (baseUrl) {
		const params = new URLSearchParams({ from: bangkokDayKey(query.from), to: bangkokDayKey(new Date(query.to.getTime() - 86_400_000)) });
		if (query.kind !== 'both') params.set('kind', query.kind);
		if (query.categoryIds.length === 1) params.set('category', query.categoryIds[0]);
		if (query.paymentMethod) params.set('payment', query.paymentMethod);
		lines.push(`ดูรายการ: ${baseUrl}/transactions?${params}`);
	}
	return lines.join('\n');
}

function formatRange(from: Date, to: Date): string {
	const end = new Date(to.getTime() - 86_400_000);
	const startParts = bangkokParts(from);
	const endParts = bangkokParts(end);
	const startMonth = new Intl.DateTimeFormat('th-TH', { month: 'short', timeZone: 'Asia/Bangkok' }).format(from);
	return startParts.month === endParts.month
		? `${startParts.day}–${endParts.day} ${startMonth} ${startParts.year + 543}`
		: `${startParts.day} ${startMonth}–${endParts.day} ${new Intl.DateTimeFormat('th-TH', { month: 'short', timeZone: 'Asia/Bangkok' }).format(end)} ${endParts.year + 543}`;
}

function validDay(value: string | null): value is string {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	return bangkokDayKey(dateStart(value)) === value && dateStart(value).getTime() === fromBangkok(year, month, day).getTime();
}

function dateStart(value: string): Date {
	const [year, month, day] = value.split('-').map(Number);
	return fromBangkok(year, month, day);
}

function extractJson(raw: string): unknown {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start < 0 || end <= start) return null;
	try { return JSON.parse(raw.slice(start, end + 1)); }
	catch { return null; }
}

async function saveUsage(userId: number, success: boolean, inputTokens: number, outputTokens: number, errorCode: string | null) {
	try { await recordLlmUsage({ userId, workflow: 'finance_query', provider: config.llm.provider, model: config.llm.model, inputTokens, outputTokens, success, errorCode }); }
	catch (error) { console.error('[finance-query] could not store usage:', error); }
}

function errorCode(error: unknown): string {
	if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
	const status = error instanceof Error ? /provider_(\d{3})/.exec(error.message)?.[1] : null;
	return status ? `http_${status}` : 'unexpected_error';
}
