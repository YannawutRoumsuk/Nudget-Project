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

export interface PostbackAction {
	/** LINE truncates a button label past 20 characters. */
	label: string;
	data: string;
}

/** A postback action rendered in LINE's quick-reply bar. */
export type QuickReplyAction = PostbackAction;

/** LINE's own caps on a buttons template: 160 characters of text, 4 actions. */
const MAX_TEMPLATE_TEXT = 160;
const MAX_ACTIONS = 4;

function toButtonsMessage(text: string, actions: PostbackAction[]) {
	return {
		type: 'template',
		altText: text.slice(0, MAX_TEMPLATE_TEXT),
		template: {
			type: 'buttons',
			text: text.slice(0, MAX_TEMPLATE_TEXT),
			actions: actions.slice(0, MAX_ACTIONS).map((action) => ({
				type: 'postback',
				label: action.label.slice(0, 20),
				data: action.data,
				displayText: action.label.slice(0, 20)
			}))
		}
	};
}

export async function pushButtons(to: string, text: string, actions: PostbackAction[]): Promise<boolean> {
	return post(PUSH_URL, { to, messages: [toButtonsMessage(text, actions)] });
}

export async function replyButtons(replyToken: string, text: string, actions: PostbackAction[]): Promise<void> {
	await post(REPLY_URL, { replyToken, messages: [toButtonsMessage(text, actions)] });
}

const MAX_QUICK_REPLY_ITEMS = 13;

function toQuickReplyMessage(text: string, actions: QuickReplyAction[]) {
	return {
		type: 'text',
		text: text.slice(0, MAX_TEXT),
		quickReply: {
			items: actions.slice(0, MAX_QUICK_REPLY_ITEMS).map((action) => ({
				type: 'action',
				action: {
					type: 'postback',
					label: action.label.slice(0, 20),
					data: action.data,
					displayText: action.label.slice(0, 20)
				}
			}))
		}
	};
}

export async function pushQuickReplies(to: string, text: string, actions: QuickReplyAction[]): Promise<boolean> {
	return post(PUSH_URL, { to, messages: [toQuickReplyMessage(text, actions)] });
}

export async function replyQuickReplies(replyToken: string, text: string, actions: QuickReplyAction[]): Promise<void> {
	await post(REPLY_URL, { replyToken, messages: [toQuickReplyMessage(text, actions)] });
}

/**
 * Best-effort: the display name only decorates the approval prompt, so a failed
 * lookup must not stop someone from being able to ask for access.
 */
export async function getDisplayName(lineUserId: string): Promise<string> {
	try {
		const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
			headers: { authorization: `Bearer ${config.line.accessToken}` },
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) return '';
		const profile = (await res.json()) as { displayName?: string };
		return profile.displayName ?? '';
	} catch (error) {
		console.error('[line] profile lookup failed:', error);
		return '';
	}
}

export async function getMessageContent(messageId: string): Promise<ArrayBuffer> {
	const res = await fetch(`${CONTENT_URL}/${encodeURIComponent(messageId)}/content`, {
		headers: { authorization: `Bearer ${config.line.accessToken}` },
		signal: AbortSignal.timeout(20_000)
	});
	if (!res.ok) throw new Error(`LINE content responded ${res.status}: ${await res.text()}`);
	return res.arrayBuffer();
}
