/**
 * One place that speaks OpenRouter, shared by the parser, the slip reader and
 * the monthly analysis.
 *
 * OpenRouter is an OpenAI-compatible gateway, so nothing about the Google or
 * Anthropic request shapes carries over: a different host, a bearer token,
 * `messages` instead of `contents`, an image as a data URI instead of
 * `inline_data`, and token counters under `usage` instead of `usageMetadata`.
 * Keeping that translation in one module is what stops three call sites from
 * each growing their own half-correct version of it.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterCall {
	apiKey: string;
	/** A gateway model id, e.g. `google/gemini-2.5-flash-lite`. */
	model: string;
	prompt: string;
	maxOutputTokens: number;
	timeoutMs: number;
	/** Base64 JPEG for a vision call; omitted for a text-only one. */
	imageBase64?: string;
}

export interface OpenRouterResult {
	text: string;
	inputTokens: number;
	outputTokens: number;
}

interface ChatCompletion {
	choices?: Array<{ message?: { content?: string | null } }>;
	usage?: { prompt_tokens?: number; completion_tokens?: number };
	/** The gateway reports upstream refusals in the body, with HTTP 200. */
	error?: { message?: string; code?: number | string };
}

/**
 * Throws `provider_<status>` on a refusal so callers can log a short reason
 * without the body, matching what the direct providers already do. A caller
 * that must not fail wraps this in its own try/catch.
 */
export async function callOpenRouter(call: OpenRouterCall): Promise<OpenRouterResult> {
	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${call.apiKey}`
		},
		body: JSON.stringify({
			model: call.model,
			messages: [{ role: 'user', content: toContent(call) }],
			// Asking for an object rather than a schema on purpose: schema dialects
			// differ between the models this gateway fronts, and every caller here
			// already re-reads the answer with zod and tolerates stray prose.
			response_format: { type: 'json_object' },
			temperature: 0,
			// Bounds the bill even on a model that thinks before answering, because
			// reasoning tokens are billed as output.
			max_tokens: call.maxOutputTokens
		}),
		signal: AbortSignal.timeout(call.timeoutMs)
	});

	if (!res.ok) throw new Error(`provider_${res.status}`);

	const body = (await res.json()) as ChatCompletion;
	// A 200 carrying an `error` is a refusal from the model behind the gateway,
	// not an answer; treating it as empty text would look like a bad reply.
	if (body.error) throw new Error(`provider_${body.error.code ?? 'error'}`);

	return {
		text: body.choices?.[0]?.message?.content ?? '',
		inputTokens: body.usage?.prompt_tokens ?? 0,
		outputTokens: body.usage?.completion_tokens ?? 0
	};
}

function toContent(call: OpenRouterCall): unknown {
	if (!call.imageBase64) return call.prompt;
	return [
		{ type: 'text', text: call.prompt },
		{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${call.imageBase64}` } }
	];
}
