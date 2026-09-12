import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fingerprintInput, generateInsight, insightSchema } from '../src/lib/server/insights';
import type { InsightInput } from '../src/lib/server/insights';

/** Mutable so a test can turn the provider off without reloading the module. */
const state = vi.hoisted(() => ({
	llm: { provider: 'gemini', apiKey: 'test-key', model: 'gemini-2.5-flash' },
	ocr: { mode: 'inline', provider: 'auto', vision: { apiKey: '', model: 'gemini-2.5-flash' } }
}));

vi.mock('$lib/server/config', () => ({ config: state }));

const fetchMock = vi.fn();

const input: InsightInput = {
	month: '2026-09',
	monthLabel: 'กันยายน 2569',
	income: 30000,
	expense: 12000,
	net: 18000,
	previousIncome: 30000,
	previousExpense: 15000,
	categories: [
		{ categoryId: 'food', current: 6000, previous: 5000, delta: 1000 },
		{ categoryId: 'transport', current: 2000, previous: 3500, delta: -1500 }
	],
	unpaidBills: 1800,
	plan: null,
	daysElapsed: 12,
	daysInMonth: 30,
	transactionCount: 48,
	busiestDay: { day: '2026-09-05', expense: 1400 }
};

beforeEach(() => {
	state.llm = { provider: 'gemini', apiKey: 'test-key', model: 'gemini-2.5-flash' };
	fetchMock.mockReset();
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
			candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }]
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
		const insight = await generateInsight(input);
		expect(insight?.headline).toBe(usable.headline);
		expect(insight?.savings[0].monthlySaving).toBe(800);
	});

	it('drops a saving that claims more than the month actually cost', async () => {
		modelReplies({
			...usable,
			savings: [
				{ title: 'เลิกกินข้าว', detail: 'ทั้งหมด', monthlySaving: 99000 },
				usable.savings[0]
			]
		});
		const insight = await generateInsight(input);
		expect(insight?.savings.map((idea) => idea.monthlySaving)).toEqual([800]);
	});

	it('clamps text a model wrote past the space the page has for it', async () => {
		modelReplies({ ...usable, headline: 'ก'.repeat(400), summary: 'ข'.repeat(900) });
		const insight = await generateInsight(input);
		expect(insight!.headline.length).toBeLessThanOrEqual(80);
		expect(insight!.summary.length).toBeLessThanOrEqual(400);
	});

	it('returns null when numbers arrive with no words around them', async () => {
		modelReplies({ ...usable, observations: [], savings: [] });
		expect(await generateInsight(input)).toBeNull();
	});

	it('never calls the API when no provider is configured', async () => {
		state.llm = { provider: 'none', apiKey: '', model: '' };
		expect(await generateInsight(input)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns null on a refused request rather than throwing', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => 'slow down' });
		await expect(generateInsight(input)).resolves.toBeNull();
	});

	it('returns null when the answer is not JSON at all', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ candidates: [{ content: { parts: [{ text: 'ขอโทษครับ' }] } }] }),
			text: async () => ''
		});
		await expect(generateInsight(input)).resolves.toBeNull();
	});

	// The whole privacy and cost argument rests on this staying true.
	it('puts only aggregates on the wire', async () => {
		modelReplies(usable);
		await generateInsight(input);
		const body = String(fetchMock.mock.calls[0][1].body);
		expect(body).toContain('12000');
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
