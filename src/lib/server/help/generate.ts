import { config } from '$lib/server/config';
import { createAiConversation, recentAiConversations } from '$lib/server/db/ai-conversations';
import { claimLlmCall, llmCallsUsed, recordLlmUsage, releaseLlmCall } from '$lib/server/db/quota';
import { callOpenRouter } from '$lib/server/llm/openrouter';

interface ProviderAnswer {
	text: string;
	inputTokens: number;
	outputTokens: number;
}

export interface HelpAnswer {
	text: string;
	remaining: number;
}

const FALLBACK = 'ตอนนี้ผู้ช่วย AI ตอบไม่ได้ชั่วคราว พิมพ์ “วิธีใช้” เพื่อดูคู่มือแบบเลือกหัวข้อได้เลย';

/** Answers only product-use questions and stores the disclosed transcript for owners. */
export async function answerAiHelp(userId: number, rawMessage: string): Promise<HelpAnswer> {
	const message = rawMessage.trim().slice(0, config.llm.helpMaxInputChars);
	const limit = config.llm.helpDailyLimit;
	if (config.llm.provider === 'none' || limit === 0) {
		await saveConversation(userId, message, FALLBACK, 0, 0);
		return { text: FALLBACK, remaining: 0 };
	}

	const now = new Date();
	let claimed = false;
	try {
		claimed = await claimLlmCall(userId, limit, now, 'help');
		if (!claimed) {
			const text = `วันนี้ใช้ผู้ช่วย AI ครบ ${limit} ครั้งแล้ว พรุ่งนี้ลองใหม่ได้ หรือพิมพ์ “วิธีใช้” เพื่อดูคู่มือ`;
			await saveConversation(userId, message, text, 0, 0);
			return { text, remaining: 0 };
		}

		const history = await recentAiConversations(userId);
		const prompt = buildPrompt(message, history);
		const result = await callProvider(prompt);
		const answer = clean(result.text) || FALLBACK;
		await saveConversation(userId, message, answer, result.inputTokens, result.outputTokens);
		await saveUsage(userId, true, result.inputTokens, result.outputTokens, null);
		const used = await llmCallsUsed(userId, now, 'help');
		return { text: `${answer}\n\nเหลือถาม AI ได้ ${Math.max(0, limit - used)} ครั้งวันนี้`, remaining: Math.max(0, limit - used) };
	} catch (error) {
		if (claimed) {
			try {
				await releaseLlmCall(userId, now, 'help');
			} catch (refundError) {
				console.error('[help] could not refund quota:', refundError);
			}
		}
		await saveUsage(userId, false, 0, 0, errorCode(error));
		await saveConversation(userId, message, FALLBACK, 0, 0);
		console.error('[help] AI answer failed:', error);
		return { text: FALLBACK, remaining: Math.max(0, limit - await llmCallsUsed(userId, now, 'help')) };
	}
}

function buildPrompt(message: string, history: Awaited<ReturnType<typeof recentAiConversations>>): string {
	const turns = history.flatMap((turn) => [
		`ผู้ใช้: ${turn.userMessage.slice(0, 500)}`,
		`Nudget: ${turn.assistantMessage.slice(0, 800)}`
	]);
	return [
		'คุณคือผู้ช่วยสอนใช้งาน Nudget ตอบภาษาไทยสั้น กระชับ และทำตามได้ทันที',
		'ตอบเฉพาะการใช้งาน Nudget ถ้าถามเรื่องอื่น ให้บอกว่าโหมดนี้ตอบเฉพาะวิธีใช้ Nudget',
		'อ่านข้อความก่อนหน้าเพื่อเข้าใจคำถามต่อ เช่น “แล้วในไลน์ต้องส่งยังไง” ต้องตอบต่อจากเรื่องที่เพิ่งคุย ไม่เริ่มคู่มือใหม่ทั้งหมด',
		'ตอบเป็นข้อความธรรมดาสำหรับ LINE เท่านั้น ห้ามใช้ Markdown ห้ามใช้ ** ห้ามใช้ backtick และห้ามใช้หัวข้อยาว',
		'ห้ามขอรหัสผ่าน API key เลขบัญชี หรือข้อมูลลับ และห้ามแต่งความสามารถที่ไม่มี',
		'',
		'ความสามารถจริง:',
		'- บันทึกรายจ่ายใน LINE: ข้าว 60, รายรับ: +เงินเดือน 30000, หลายรายการใช้คนละบรรทัด',
		'- ส่งรูปสลิปแล้วตรวจยอด วันที่ หมวด และโน้ตก่อนบันทึก',
		'- คำสั่ง: วันนี้, เดือนนี้, งบ, บิล, ลบ, โน้ต <ข้อความ>, เว็บ, ฟีดแบ็ก, วิธีใช้',
		'- เว็บ: ดู/เพิ่ม/แก้/คัดลอกรายการ ดูกราฟ วิเคราะห์ ตั้งแผนเดือน จัดการบิล ส่งออก และส่งฟีดแบ็ก',
		'- วิธีใช้แบบเลือกหัวข้อ: วิธีใช้บันทึก, วิธีใช้สลิป, วิธีใช้เว็บ, วิธีใช้บิล, วิธีใช้คำสั่ง',
		'- ออกจากโหมดนี้: พิมพ์ จบช่วยเหลือ หรือ ออก',
		turns.length ? '\nบทสนทนาล่าสุด:\n' + turns.join('\n') : '',
		'',
		`คำถามใหม่: ${message}`,
		'ตอบไม่เกิน 5 บรรทัด และยกตัวอย่างคำสั่งเมื่อช่วยให้ทำตามได้'
	].join('\n');
}

async function callProvider(prompt: string): Promise<ProviderAnswer> {
	if (config.llm.provider === 'openrouter') {
		return callOpenRouter({
			apiKey: config.llm.apiKey,
			model: config.llm.helpModel,
			prompt,
			maxOutputTokens: config.llm.helpMaxOutputTokens,
			timeoutMs: config.llm.timeoutMs,
			reasoning: { effort: 'minimal', exclude: true }
		});
	}
	if (config.llm.provider === 'anthropic') {
		const res = await request('https://api.anthropic.com/v1/messages', {
			'content-type': 'application/json',
			'x-api-key': config.llm.apiKey,
			'anthropic-version': '2023-06-01'
		}, {
			model: config.llm.helpModel,
			max_tokens: config.llm.helpMaxOutputTokens,
			messages: [{ role: 'user', content: prompt }]
		});
		const body = await res.json() as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
		return {
			text: (body.content ?? []).filter((part) => part.type === 'text').map((part) => part.text ?? '').join(''),
			inputTokens: body.usage?.input_tokens ?? 0,
			outputTokens: body.usage?.output_tokens ?? 0
		};
	}

	const res = await request(`https://generativelanguage.googleapis.com/v1beta/models/${config.llm.helpModel}:generateContent`, {
		'content-type': 'application/json',
		'x-goog-api-key': config.llm.apiKey
	}, {
		contents: [{ parts: [{ text: prompt }] }],
		generationConfig: { temperature: 0.2, maxOutputTokens: config.llm.helpMaxOutputTokens }
	});
	const body = await res.json() as {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
		usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
	};
	return {
		text: (body.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join(''),
		inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
		outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0
	};
}

async function request(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
	const res = await fetch(url, {
		method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(config.llm.timeoutMs)
	});
	if (!res.ok) throw new Error(`provider_${res.status}`);
	return res;
}

function clean(value: string): string {
	return value
		.replace(/\*\*(.*?)\*\*/gs, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^\s*[-*]\s+/gm, '• ')
		.trim()
		.slice(0, 1000)
		.trim();
}

async function saveConversation(userId: number, userMessage: string, assistantMessage: string, inputTokens: number, outputTokens: number) {
	await createAiConversation({
		userId, userMessage, assistantMessage, provider: config.llm.provider,
		model: config.llm.helpModel, inputTokens, outputTokens
	});
}

async function saveUsage(userId: number, success: boolean, inputTokens: number, outputTokens: number, errorCodeValue: string | null) {
	try {
		await recordLlmUsage({
			userId, workflow: 'help', provider: config.llm.provider, model: config.llm.helpModel,
			inputTokens, outputTokens, success, errorCode: errorCodeValue
		});
	} catch (error) {
		console.error('[help] could not store token metrics:', error);
	}
}

function errorCode(error: unknown): string {
	if (error instanceof Error && /^provider_\w+$/.test(error.message)) return error.message;
	return error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'unexpected_error';
}
