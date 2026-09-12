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
	/**
	 * The exact object the caller needs back, in the same JSON Schema the direct
	 * Google path sends. Asking only for "some JSON object" is not enough: the
	 * model then invents its own field names — `category`/`description` where the
	 * code reads `kind`/`note` — and a reply that parses as JSON still fails
	 * validation, which looks to a user like the feature being broken.
	 */
	jsonSchema?: { name: string; schema: JsonSchema };
}

type JsonSchema = Record<string, unknown>;

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
			response_format: call.jsonSchema
				? {
						type: 'json_schema',
						json_schema: {
							name: call.jsonSchema.name,
							strict: true,
							schema: toGatewayDialect(call.jsonSchema.schema)
						}
					}
				: { type: 'json_object' },
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

/**
 * Google accepts `type: ['string', 'null']` for a nullable field; the
 * OpenAI-shaped schema this gateway expects wants `anyOf` instead. Converting
 * here keeps one schema per caller as the single source of truth rather than
 * two that drift apart, and object nodes get `additionalProperties: false` so a
 * model cannot answer with extra keys the caller never asked for.
 */
function toGatewayDialect(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(toGatewayDialect);
	if (node === null || typeof node !== 'object') return node;

	const source = node as JsonSchema;
	const out: JsonSchema = {};
	for (const [key, value] of Object.entries(source)) {
		if (key === 'type' && Array.isArray(value)) {
			out.anyOf = value.map((type) => ({ type }));
			continue;
		}
		out[key] = toGatewayDialect(value);
	}
	if (out.type === 'object' && out.additionalProperties === undefined) out.additionalProperties = false;
	return out;
}

function toContent(call: OpenRouterCall): unknown {
	if (!call.imageBase64) return call.prompt;
	return [
		{ type: 'text', text: call.prompt },
		{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${call.imageBase64}` } }
	];
}
