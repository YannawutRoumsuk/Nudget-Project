import { config } from '$lib/server/config';

const REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const CONTENT_URL = 'https://api-data.line.me/v2/bot/message';

/** LINE hard-caps a single text message at 5000 characters. */
const MAX_TEXT = 5000;

interface TextMessage {
	type: 'text';
	text: string;
}

function toMessages(text: string): TextMessage[] {
	return [{ type: 'text', text: text.slice(0, MAX_TEXT) }];
}

async function post(url: string, body: unknown): Promise<boolean> {
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${config.line.accessToken}`
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10_000)
	});

	if (!res.ok) {
		// A failed reply must not fail the webhook — LINE would just retry and we
		// would re-run the (already committed) side effects.
		console.error(`[line] ${url} responded ${res.status}: ${await res.text()}`);
		return false;
	}
	return true;
}

export async function replyText(replyToken: string, text: string): Promise<void> {
	await post(REPLY_URL, { replyToken, messages: toMessages(text) });
}

export async function pushText(to: string, text: string): Promise<boolean> {
	return post(PUSH_URL, { to, messages: toMessages(text) });
}

export async function getMessageContent(messageId: string): Promise<ArrayBuffer> {
	const res = await fetch(`${CONTENT_URL}/${encodeURIComponent(messageId)}/content`, {
		headers: { authorization: `Bearer ${config.line.accessToken}` },
		signal: AbortSignal.timeout(20_000)
	});
	if (!res.ok) throw new Error(`LINE content responded ${res.status}: ${await res.text()}`);
	return res.arrayBuffer();
}
