import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callOpenRouter } from '../src/lib/server/llm/openrouter';

/**
 * The gateway speaks a different dialect from the two direct providers, and
 * every mistake in that translation is silent: a wrong header is a 401 the app
 * treats as "model unavailable", and a wrong usage path is a bill nobody can
 * account for. These assert the shape of the request and where the numbers
 * come from, never the real API.
 */
const fetchMock = vi.fn();

const call = {
	apiKey: 'sk-or-test',
	model: 'google/gemini-2.5-flash-lite',
	prompt: 'สวัสดี',
	maxOutputTokens: 150,
	timeoutMs: 8_000
};

function answers(content: string, usage?: Record<string, number>, extra?: Record<string, unknown>) {
	fetchMock.mockResolvedValue({
		ok: true,
		status: 200,
		json: async () => ({ choices: [{ message: { content } }], usage, ...extra }),
		text: async () => ''
	});
}

function sentBody(): Record<string, unknown> {
	return JSON.parse(String(fetchMock.mock.calls[0][1].body));
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('callOpenRouter', () => {
	it('posts to the gateway with a bearer token, not a provider header', async () => {
		answers('{"ok":true}');
		await callOpenRouter(call);

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
		expect(init.headers.authorization).toBe('Bearer sk-or-test');
		expect(init.headers['x-goog-api-key']).toBeUndefined();
		expect(init.headers['x-api-key']).toBeUndefined();
	});

	it('sends the OpenAI message shape and bounds the output', async () => {
		answers('{"ok":true}');
		await callOpenRouter(call);

		const body = sentBody();
		expect(body.model).toBe('google/gemini-2.5-flash-lite');
		expect(body.messages).toEqual([{ role: 'user', content: 'สวัสดี' }]);
		expect(body.max_tokens).toBe(150);
		expect(body.response_format).toEqual({ type: 'json_object' });
	});

	it('reads token counters from usage, where this gateway puts them', async () => {
		answers('{"ok":true}', { prompt_tokens: 412, completion_tokens: 58 });
		const result = await callOpenRouter(call);

		expect(result).toEqual({ text: '{"ok":true}', inputTokens: 412, outputTokens: 58 });
	});

	it('reports zero rather than NaN when the gateway omits usage', async () => {
		answers('{"ok":true}');
		const result = await callOpenRouter(call);

		expect(result.inputTokens).toBe(0);
		expect(result.outputTokens).toBe(0);
	});

	it('attaches an image as a data URI for a vision call', async () => {
		answers('{"amount":120}');
		await callOpenRouter({ ...call, imageBase64: 'QUJD' });

		const body = sentBody() as { messages: Array<{ content: Array<Record<string, unknown>> }> };
		const [text, image] = body.messages[0].content;
		expect(text).toEqual({ type: 'text', text: 'สวัสดี' });
		expect(image).toEqual({
			type: 'image_url',
			image_url: { url: 'data:image/jpeg;base64,QUJD' }
		});
	});

	it('throws with the status so the caller can log a reason without the body', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'no credits' });
		await expect(callOpenRouter(call)).rejects.toThrow('provider_401');
	});

	// The gateway answers 200 and puts the upstream refusal in the body, so
	// trusting the status alone would read a refusal as an empty answer.
	it('treats an error carried inside a 200 as a refusal', async () => {
		answers('', undefined, { error: { message: 'upstream rejected', code: 429 } });
		await expect(callOpenRouter(call)).rejects.toThrow('provider_429');
	});

	it('returns empty text rather than throwing when a choice has no content', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ choices: [{ message: { content: null } }] }),
			text: async () => ''
		});
		expect((await callOpenRouter(call)).text).toBe('');
	});
});
