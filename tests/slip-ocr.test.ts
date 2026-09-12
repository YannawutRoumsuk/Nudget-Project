import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSlipWithGemini } from '../src/lib/server/ocr/gemini';
import { parseSlipText } from '../src/lib/server/ocr/slip';

/** Mutable so each test can force a provider without reloading the module. */
const state = vi.hoisted(() => ({
	llm: { provider: 'gemini', apiKey: 'test-key', model: 'gemini-2.5-flash' },
	ocr: {
		mode: 'inline',
		provider: 'auto',
		vision: { apiKey: 'test-key', model: 'gemini-2.5-flash' }
	}
}));

vi.mock('$lib/server/config', () => ({ config: state }));

/** A real JPEG, because `readSlipWithGemini` genuinely downscales before sending. */
let image: Buffer;

beforeAll(async () => {
	image = await sharp({
		create: { width: 1600, height: 2400, channels: 3, background: { r: 255, g: 255, b: 255 } }
	})
		.jpeg()
		.toBuffer();
});

const fetchMock = vi.fn();

beforeEach(() => {
	state.llm = { provider: 'gemini', apiKey: 'test-key', model: 'gemini-2.5-flash' };
	state.ocr = { mode: 'inline', provider: 'auto', vision: { apiKey: 'test-key', model: 'gemini-2.5-flash' } };
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function geminiReplies(payload: unknown): void {
	fetchMock.mockResolvedValue({
		ok: true,
		status: 200,
		json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
		text: async () => ''
	} as unknown as Response);
}

const SLIP = {
	amount: 1250.5,
	date: '2026-09-05',
	time: '13:42',
	recipient: 'ร้านข้าวแกง',
	sender: 'นาย ก',
	reference: 'PAY202609ABC123',
	bank: 'กสิกรไทย',
	text: 'โอนเงินสำเร็จ\nจำนวนเงิน 1,250.50 บาท'
};

describe('readSlipWithGemini', () => {
	it('maps a valid response onto SlipOcrResult', async () => {
		geminiReplies(SLIP);

		const result = await readSlipWithGemini(image);

		expect(result).not.toBeNull();
		expect(result?.amount).toBe(1250.5);
		expect(result?.occurredAt?.toISOString()).toBe('2026-09-05T06:42:00.000Z');
		expect(result?.recipient).toBe('ร้านข้าวแกง');
		expect(result?.reference).toBe('PAY202609ABC123');
		// The unmodelled fields ride along so a mis-read stays diagnosable.
		expect(result?.text).toContain('จำนวนเงิน 1,250.50 บาท');
		expect(result?.text).toContain('กสิกรไทย');
		expect(result?.text).toContain('นาย ก');
	});

	it('converts a Buddhist-era year the model forgot to convert', async () => {
		geminiReplies({ ...SLIP, date: '2569-09-05' });

		const result = await readSlipWithGemini(image);

		expect(result?.occurredAt?.toISOString()).toBe('2026-09-05T06:42:00.000Z');
	});

	it('sends a downscaled JPEG rather than the original image', async () => {
		geminiReplies(SLIP);

		await readSlipWithGemini(image);

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain('gemini-2.5-flash:generateContent');
		const body = JSON.parse(init.body);
		const inline = body.contents[0].parts[1].inline_data;
		expect(inline.mime_type).toBe('image/jpeg');
		const sent = await sharp(Buffer.from(inline.data, 'base64')).metadata();
		expect(Math.max(sent.width ?? 0, sent.height ?? 0)).toBeLessThanOrEqual(1024);
	});

	it('rejects an out-of-range amount instead of trusting the model', async () => {
		geminiReplies({ ...SLIP, amount: 99_999_999_999 });

		expect(await readSlipWithGemini(image)).toBeNull();
	});

	it('drops an impossible date but keeps the rest of the slip', async () => {
		geminiReplies({ ...SLIP, date: '2026-02-31' });

		const result = await readSlipWithGemini(image);

		expect(result?.amount).toBe(1250.5);
		expect(result?.occurredAt).toBeNull();
	});

	it('returns null on a non-OK response rather than throwing', async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 429,
			text: async () => 'rate limited',
			json: async () => ({})
		} as unknown as Response);

		expect(await readSlipWithGemini(image)).toBeNull();
	});

	it('retries a network failure exactly once', async () => {
		fetchMock
			.mockRejectedValueOnce(new Error('socket hang up'))
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(SLIP) }] } }] }),
				text: async () => ''
			} as unknown as Response);

		expect((await readSlipWithGemini(image))?.amount).toBe(1250.5);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('gives up after the second network failure', async () => {
		fetchMock.mockRejectedValue(new Error('socket hang up'));

		expect(await readSlipWithGemini(image)).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('never calls the API when no key is configured', async () => {
		state.ocr = { mode: 'inline', provider: 'auto', vision: { apiKey: '', model: 'gemini-2.5-flash' } };

		expect(await readSlipWithGemini(image)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('stays out of the way when the reader is forced to Tesseract', async () => {
		state.ocr = { mode: 'inline', provider: 'tesseract', vision: { apiKey: 'test-key', model: 'gemini-2.5-flash' } };

		expect(await readSlipWithGemini(image)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	// The text parser and the slip reader are configured separately: running
	// Claude for categorising messages must not switch slip reading off.
	it('reads slips even when the text parser is pointed at another provider', async () => {
		state.llm = { provider: 'anthropic', apiKey: 'claude-key', model: 'claude-haiku-4-5-20251001' };
		geminiReplies({ amount: 120, date: '2026-09-05', time: '13:42', recipient: 'ร้านกาแฟ', sender: '', reference: 'REF9', bank: '', text: 'สลิป' });

		expect(await readSlipWithGemini(image)).not.toBeNull();
		expect(fetchMock).toHaveBeenCalledOnce();
	});
});

describe('slip OCR text parsing', () => {
	it('extracts Thai amount, Buddhist date and recipient', () => {
		const result = parseSlipText('โอนเงินสำเร็จ\nวันที่ 05/09/2569 13:42\nไปยัง ร้านข้าวแกง\nจำนวนเงิน 1,250.50 บาท\nเลขที่รายการ ABC123');
		expect(result.amount).toBe(1250.5);
		expect(result.occurredAt?.toISOString()).toBe('2026-09-05T06:42:00.000Z');
		expect(result.recipient).toBe('ร้านข้าวแกง');
		expect(result.reference).toBe('ABC123');
	});

	it('does not mistake account and reference numbers for an amount', () => {
		const result = parseSlipText('บัญชี xxx-1-23456-x\nReference 999999999999\nAmount THB 89.00');
		expect(result.amount).toBe(89);
	});

	it('returns null when the total is unreadable', () => {
		expect(parseSlipText('โอนเงินสำเร็จ').amount).toBeNull();
	});

	it('rejects an impossible calendar date', () => {
		expect(parseSlipText('วันที่ 31/02/2569\nจำนวนเงิน 50.00 บาท').occurredAt).toBeNull();
	});
});
