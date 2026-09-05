import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	handleEvents: vi.fn(),
	config: { line: { channelSecret: 'test-secret', accessToken: 'test-token' } }
}));
vi.mock('$lib/server/config', () => ({ config: mocks.config }));
vi.mock('$lib/server/line/handler', () => ({ handleEvents: mocks.handleEvents }));
import { POST } from '../src/routes/api/line/webhook/+server';

function send(raw: string, signature = createHmac('sha256', 'test-secret').update(raw).digest('base64')) {
	return POST({ request: new Request('http://localhost/api/line/webhook', {
		method: 'POST', body: raw, headers: { 'x-line-signature': signature }
	}) } as Parameters<typeof POST>[0]);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.handleEvents.mockResolvedValue(undefined);
	mocks.config.line.accessToken = 'test-token';
});

describe('LINE webhook', () => {
	it('rejects invalid signatures before parsing JSON', async () => {
		expect((await send('not JSON', 'invalid')).status).toBe(401);
		expect(mocks.handleEvents).not.toHaveBeenCalled();
	});
	it.each(['not JSON', 'null', '{}', '{"events":{}}', '{"events":[null]}', '{"events":[{"type":42}]}'])('rejects malformed signed payload %s', async (raw) => {
		expect((await send(raw)).status).toBe(400);
		expect(mocks.handleEvents).not.toHaveBeenCalled();
	});
	it('accepts the console verification without an access token', async () => {
		mocks.config.line.accessToken = '';
		expect((await send('{"destination":"bot","events":[]}')).status).toBe(200);
	});
	it('requests redelivery when processing fails', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.handleEvents.mockRejectedValueOnce(new Error('database offline'));
		expect((await send('{"events":[{"type":"message"}]}')).status).toBe(503);
		log.mockRestore();
	});
});
