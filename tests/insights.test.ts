import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fingerprintInput, generateInsight, insightSchema } from '../src/lib/server/insights';
import type { InsightInput } from '../src/lib/server/insights';

/** Mutable so a test can turn the provider off without reloading the module. */
const state = vi.hoisted(() => ({
	llm: { provider: 'gemini', apiKey: 'test-key', model: 'gemini-2.5-flash' },
	ocr: { mode: 'inline', provider: 'auto', vision: { apiKey: '', model: 'gemini-2.5-flash' } }
}));
const recordLlmUsage = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/config', () => ({ config: state }));
vi.mock('$lib/server/db/quota', () => ({ recordLlmUsage }));

const fetchMock = vi.fn();

const input: InsightInput = {
	month: '2026-09',
	monthLabel: 'กันยายน 2569',
	income: 30000,
	expense: 12000,
	net: 18000,
	savings: 18000,
	savingsRate: 60,
	creditCardSpent: 3200,
	previousIncome: 30000,
	previousExpense: 15000,
	categories: [
		{ categoryId: 'food', current: 6000, previous: 5000, delta: 1000 },
		{ categoryId: 'transport', current: 2000, previous: 3500, delta: -1500 }
	],
	unpaidBills: 1800,
	remainingBudget: null,
	plan: null,
	daysElapsed: 12,
	daysInMonth: 30,
	transactionCount: 48,
	busiestDay: { day: '2026-09-05', expense: 1400 }
};

beforeEach(() => {
	state.llm = { provider: 'gemini', apiKey: 'test-key', model: 'gemini-2.5-flash' };
	fetchMock.mockReset();
	recordLlmUsage.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function modelReplies(payload: unknown): void {
	fetchMock.mockResolvedValue({
		ok: true,
		status: 200,
		json: async () => ({
			candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
			usageMetadata: { promptTokenCount: 321, candidatesTokenCount: 87 }
		}),
		text: async () => ''
	});
}

const usable = {
	headline: 'เดือนนี้จ่ายน้อยลง 3,000 บาท',
	summary: 'รายจ่ายรวม 12,000 บาท ลดลงจากเดือนก่อนที่ 15,000 บาท',
	observations: ['ค่าเดินทางลดลง 1,500 บาท', 'ค่าอาหารเพิ่มขึ้น 1,000 บาท'],
	savings: [{ title: 'ทำกับข้าวเองสัปดาห์ละ 2 มื้อ', detail: 'ตัดจากค่าอาหาร', monthlySaving: 800 }]
};

describe('generateInsight', () => {
	it('maps a well-formed answer onto an Insight', async () => {
		modelReplies(usable);
		const insight = await generateInsight(input, 7);
		expect(insight?.headline).toBe(usable.headline);
		expect(insight?.savings[0].monthlySaving).toBe(800);
	});

	it('records token counters without storing prompt or response text', async () => {
		modelReplies(usable);
		await generateInsight(input, 7);
		expect(recordLlmUsage).toHaveBeenCalledWith({
			userId: 7,
			workflow: 'insights',
			provider: 'gemini',
			model: 'gemini-2.5-flash',
			inputTokens: 321,
			outputTokens: 87,
			success: true,
			errorCode: null
		});
		expect(JSON.stringify(recordLlmUsage.mock.calls[0][0])).not.toContain(usable.headline);
	});

	it('drops a saving that claims more than the month actually cost', async () => {
		modelReplies({
			...usable,
			savings: [
				{ title: 'เลิกกินข้าว', detail: 'ทั้งหมด', monthlySaving: 99000 },
				usable.savings[0]
			]
		});
		const insight = await generateInsight(input, 7);
		expect(insight?.savings.map((idea) => idea.monthlySaving)).toEqual([800]);
	});

	it('clamps text a model wrote past the space the page has for it', async () => {
		modelReplies({ ...usable, headline: 'ก'.repeat(400), summary: 'ข'.repeat(900) });
		const insight = await generateInsight(input, 7);
		expect(insight!.headline.length).toBeLessThanOrEqual(80);
		expect(insight!.summary.length).toBeLessThanOrEqual(400);
	});

	it('returns null when numbers arrive with no words around them', async () => {
		modelReplies({ ...usable, observations: [], savings: [] });
		expect(await generateInsight(input, 7)).toBeNull();
	});

	it('never calls the API when no provider is configured', async () => {
		state.llm = { provider: 'none', apiKey: '', model: '' };
		expect(await generateInsight(input, 7)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns null on a refused request rather than throwing', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => 'slow down' });
		await expect(generateInsight(input, 7)).resolves.toBeNull();
	});

	// A refused call still has to leave a trace, otherwise the metrics table
	// would show a quiet month whenever the provider was the thing failing.
	it('records a failed call with no tokens and a reason', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => 'slow down' });
		await generateInsight(input, 7);
		expect(recordLlmUsage).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 7,
				success: false,
				inputTokens: 0,
				outputTokens: 0,
				errorCode: 'provider_error'
			})
		);
	});

	it('separates an unusable answer from an unreachable provider', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				candidates: [{ content: { parts: [{ text: 'ขอโทษครับ' }] } }],
				usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 12 }
			}),
			text: async () => ''
		});
		await generateInsight(input, 7);
		// Those tokens were spent even though nothing usable came back, so they
		// are counted rather than written off as zero.
		expect(recordLlmUsage).toHaveBeenCalledWith(
			expect.objectContaining({ success: false, inputTokens: 300, outputTokens: 12, errorCode: 'invalid_output' })
		);
	});

	it('keeps the analysis when the metrics table refuses the row', async () => {
		recordLlmUsage.mockRejectedValueOnce(new Error('metrics offline'));
		modelReplies(usable);
		expect((await generateInsight(input, 7))?.headline).toBe(usable.headline);
	});

	it('returns null when the answer is not JSON at all', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ candidates: [{ content: { parts: [{ text: 'ขอโทษครับ' }] } }] }),
			text: async () => ''
		});
		await expect(generateInsight(input, 7)).resolves.toBeNull();
	});

	// The whole privacy and cost argument rests on this staying true.
	it('puts only aggregates on the wire', async () => {
		modelReplies(usable);
		await generateInsight(input, 7);
		const body = String(fetchMock.mock.calls[0][1].body);
		expect(body).toContain('12000');
		expect(body).toContain('ยอดใช้บัตรเครดิต: 3200');
		expect(body).not.toContain('lineUserId');
		expect(body).not.toContain('rawText');
	});
});

describe('fingerprintInput', () => {
	it('is stable for the same numbers', () => {
		expect(fingerprintInput(input)).toBe(fingerprintInput({ ...input }));
	});
	it('changes when any number changes', () => {
		expect(fingerprintInput({ ...input, expense: 12001 })).not.toBe(fingerprintInput(input));
		expect(
			fingerprintInput({ ...input, categories: [{ categoryId: 'food', current: 1, previous: 0, delta: 1 }] })
		).not.toBe(fingerprintInput(input));
	});
});

describe('insightSchema', () => {
	// Stored rows are read back through the same gate, so a payload that rotted
	// in the database is a cache miss rather than something the page renders.
	it('rejects a stored payload that no longer fits the shape', () => {
		expect(insightSchema.safeParse({ headline: 'x' }).success).toBe(false);
		expect(insightSchema.safeParse(usable).success).toBe(true);
	});
});
