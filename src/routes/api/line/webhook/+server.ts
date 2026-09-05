import { json, text } from '@sveltejs/kit';
import { z } from 'zod';
import { config } from '$lib/server/config';
import { handleEvents } from '$lib/server/line/handler';
import { verifyLineSignature } from '$lib/server/line/signature';
import type { RequestHandler } from './$types';

/** Health probe. LINE verifies with a signed POST containing an empty events array. */
export const GET: RequestHandler = () => json({ ok: true });

const payloadSchema = z.object({
	events: z.array(z.object({
		type: z.string(),
		replyToken: z.string().optional(),
		webhookEventId: z.string().min(1).optional(),
		timestamp: z.number().int().nonnegative().max(8_640_000_000_000_000).optional(),
		source: z.object({ type: z.string(), userId: z.string().optional() }).optional(),
		message: z.object({
			id: z.string().min(1),
			type: z.string(),
			text: z.string().optional(),
			contentProvider: z.object({ type: z.string() }).optional()
		}).optional()
	}))
});

export const POST: RequestHandler = async ({ request }) => {
	if (!config.line.channelSecret) {
		console.error('[webhook] LINE_CHANNEL_SECRET is not set — rejecting');
		return text('not configured', { status: 503 });
	}

	// The signature covers the exact bytes LINE sent, so read the body as text
	// and only parse it after the check passes.
	const raw = await request.text();
	if (!verifyLineSignature(raw, request.headers.get('x-line-signature'), config.line.channelSecret)) {
		return text('invalid signature', { status: 401 });
	}

	let payload;
	try {
		payload = payloadSchema.safeParse(JSON.parse(raw));
	} catch {
		return text('invalid payload', { status: 400 });
	}

	if (!payload.success) return text('invalid payload', { status: 400 });
	if (payload.data.events.length > 0 && !config.line.accessToken) {
		return text('not configured', { status: 503 });
	}
	try {
		await handleEvents(payload.data.events);
	} catch (error) {
		console.error('[webhook] processing failed:', error);
		return text('processing failed', { status: 503 });
	}

	// Enable Webhook redelivery in LINE Developers to retry failed requests.
	return text('ok');
};
