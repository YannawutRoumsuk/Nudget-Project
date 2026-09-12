import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	config: {
		llm: {
			provider: 'gemini' as 'gemini' | 'openrouter' | 'none', apiKey: 'test-key', model: 'gemini-2.5-flash-lite',
			parserDailyLimit: 2, maxInputChars: 500, maxOutputTokens: 150, timeoutMs: 8_000
		}
	},
	claim: vi.fn(), release: vi.fn(), record: vi.fn()
}));

vi.mock('../src/lib/server/config', () => ({ config: state.config }));
vi.mock('../src/lib/server/db/quota', () => ({
	claimLlmCall: state.claim,
	releaseLlmCall: state.release,
	recordLlmUsage: state.record
}));

const fetchMock = vi.fn();
const { parseMessage } = await import('../src/lib/server/parser');
const NOW = new Date('2026-09-12T05:00:00Z');

function answer(payload: Record<string, unknown>, inputTokens = 80, outputTokens = 25): void {
	fetchMock.mockResolvedValue({
		ok: true,
		json: async () => ({
			candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
			usageMetadata: { promptTokenCount: inputTokens, candidatesTokenCount: outputTokens }
		})
	});
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.stubGlobal('fetch', fetchMock);
	state.config.llm.provider = 'gemini';
	state.claim.mockResolvedValue(true);
});

describe('metered LLM parser fallback', () => {
	it('does not claim quota or call Gemini for a normal rule match', async () => {
		const result = await parseMessage('ข้าว 60', NOW, { userId: 7 });
		expect(result.type).toBe('transaction');
		expect(state.claim).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('uses structured output and records token counters without the prompt', async () => {
		answer({ isTransaction: true, kind: 'expense', amount: 250, category: 'shopping', note: 'atelier', date: null, paymentMethod: 'credit_card' });
		const result = await parseMessage('atelier 250 รูดบัตร', NOW, { userId: 7 });
		expect(result).toMatchObject({ type: 'transaction', tx: { amount: 250, categoryId: 'shopping', paymentMethod: 'credit_card', parsedBy: 'llm' } });
		expect(state.claim).toHaveBeenCalledWith(7, 2, NOW, 'parser');
		const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
		expect(request.generationConfig).toMatchObject({ responseMimeType: 'application/json', maxOutputTokens: 150 });
		expect(request.generationConfig.responseJsonSchema.required).toContain('paymentMethod');
		expect(state.record).toHaveBeenCalledWith(expect.objectContaining({
			userId: 7, workflow: 'parser', inputTokens: 80, outputTokens: 25, success: true
		}));
		expect(JSON.stringify(state.record.mock.calls)).not.toContain('atelier');
	});

	it('falls back without a provider call when the daily ceiling is exhausted', async () => {
		state.claim.mockResolvedValue(false);
		const result = await parseMessage('atelier 250', NOW, { userId: 7 });
		expect(result).toMatchObject({ type: 'transaction', tx: { categoryId: 'other', parsedBy: 'rule' } });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('refunds the claim and keeps the rule result when Gemini is unavailable', async () => {
		fetchMock.mockRejectedValue(new Error('offline'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = await parseMessage('atelier 250', NOW, { userId: 7 });
		expect(result).toMatchObject({ type: 'transaction', tx: { categoryId: 'other' } });
		expect(state.release).toHaveBeenCalledWith(7, NOW, 'parser');
		log.mockRestore();
	});

	it('rejects oversized input before claiming or sending it', async () => {
		const result = await parseMessage(`${'ก'.repeat(501)} 50`, NOW, { userId: 7 });
		expect(result.type).toBe('transaction');
		expect(state.claim).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('the parser through OpenRouter', () => {
	beforeEach(() => {
		state.config.llm.provider = 'openrouter';
		state.config.llm.apiKey = 'sk-or-test';
		state.config.llm.model = 'google/gemini-2.5-flash-lite';
		state.claim.mockResolvedValue(true);
	});

	it('reaches the gateway instead of Google and still returns an entry', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				choices: [{ message: { content: JSON.stringify({
					isTransaction: true, kind: 'expense', amount: 250, category: 'other',
					note: 'atelier', date: null, paymentMethod: 'bank'
				}) } }],
				usage: { prompt_tokens: 91, completion_tokens: 30 }
			}),
			text: async () => ''
		});

		const result = await parseMessage('atelier 250', NOW, { userId: 7 });

		expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
		expect(result).toMatchObject({ type: 'transaction', tx: { amount: 250, parsedBy: 'llm' } });
		// The counters must come from the gateway's own field names, or the bill
		// silently reads as zero for every call made this way.
		expect(state.record).toHaveBeenCalledWith(
			expect.objectContaining({ provider: 'openrouter', inputTokens: 91, outputTokens: 30, success: true })
		);
	});

	it('refunds the claim when the gateway refuses', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 402, text: async () => 'no credits' });
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});

		await parseMessage('atelier 250', NOW, { userId: 7 });

		expect(state.release).toHaveBeenCalledWith(7, NOW, 'parser');
		expect(state.record).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'http_402' }));
		log.mockRestore();
	});
});
