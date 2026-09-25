import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	callOpenRouter: vi.fn(), claimLlmCall: vi.fn(), releaseLlmCall: vi.fn(), recordLlmUsage: vi.fn(), getFinanceQueryAggregate: vi.fn(),
	config: { llm: { provider: 'openrouter', apiKey: 'test', model: 'google/gemini-2.5-flash-lite', helpDailyLimit: 3, timeoutMs: 8000 }, publicBaseUrl: 'https://nudget.example' }
}));

vi.mock('$lib/server/config', () => ({ config: mocks.config }));
vi.mock('$lib/server/llm/openrouter', () => ({ callOpenRouter: mocks.callOpenRouter }));
vi.mock('$lib/server/db/quota', () => ({ claimLlmCall: mocks.claimLlmCall, releaseLlmCall: mocks.releaseLlmCall, recordLlmUsage: mocks.recordLlmUsage }));
vi.mock('$lib/server/db/queries', () => ({ getFinanceQueryAggregate: mocks.getFinanceQueryAggregate }));

import { answerFinanceQuestion } from '../src/lib/server/finance-query';

const intent = {
	intent: 'query', kind: 'expense', fromDate: '2026-09-01', toDate: '2026-09-08',
	compareFromDate: '2026-08-25', compareToDate: '2026-09-01', categoryIds: ['food'], paymentMethod: 'cash', groupBy: 'category'
};

beforeEach(() => {
	vi.resetAllMocks();
	mocks.claimLlmCall.mockResolvedValue(true);
	mocks.callOpenRouter.mockResolvedValue({ text: JSON.stringify(intent), inputTokens: 250, outputTokens: 50 });
	mocks.getFinanceQueryAggregate.mockResolvedValue({ totals: { income: 0, expense: 840, net: -840, count: 5 }, breakdown: [{ key: 'food', amount: 840, count: 5 }] });
	mocks.releaseLlmCall.mockResolvedValue(undefined);
});

describe('LINE natural-language finance query', () => {
	it('converts intent to an owner-scoped bounded aggregate and links to exact filtered rows', async () => {
		const answer = await answerFinanceQuestion(9, 'อาทิตย์นี้จ่ายค่าอาหารเงินสดเท่าไร เทียบช่วงก่อน', new Date('2026-09-07T05:00:00.000Z'));
		expect(mocks.callOpenRouter).toHaveBeenCalledWith(expect.objectContaining({
			maxOutputTokens: 180,
			jsonSchema: expect.objectContaining({ name: 'finance_query' })
		}));
		expect(mocks.claimLlmCall).toHaveBeenCalledWith(9, 3, expect.any(Date), 'finance_query');
		expect(mocks.getFinanceQueryAggregate).toHaveBeenCalledTimes(2);
		expect(mocks.getFinanceQueryAggregate).toHaveBeenCalledWith(9, expect.objectContaining({
			kind: 'expense', categoryIds: ['food'], paymentMethod: 'cash', from: expect.any(Date), to: expect.any(Date)
		}));
		expect(answer).toContain('1–7 ก.ย. 2569');
		expect(answer).toContain('เทียบช่วงก่อน (25–31 ส.ค. 2569) 840 บาท');
		expect(answer).toContain('/transactions?from=2026-09-01&to=2026-09-07&kind=expense&category=food&payment=cash');
		expect(mocks.recordLlmUsage).toHaveBeenCalledWith(expect.objectContaining({ workflow: 'finance_query', success: true, userId: 9 }));
	});

	it('rejects invalid model dates without ever querying the ledger', async () => {
		mocks.callOpenRouter.mockResolvedValue({ text: JSON.stringify({ ...intent, fromDate: '2026-02-30' }), inputTokens: 200, outputTokens: 40 });
		const answer = await answerFinanceQuestion(9, 'เดือนนี้จ่ายเท่าไร', new Date('2026-09-07T05:00:00.000Z'));
		expect(answer).toContain('อยากดูช่วงไหน');
		expect(mocks.getFinanceQueryAggregate).not.toHaveBeenCalled();
	});

	it('does not call the model or database after the daily quota is used', async () => {
		mocks.claimLlmCall.mockResolvedValue(false);
		const answer = await answerFinanceQuestion(9, 'อาทิตย์นี้กินไปเท่าไร');
		expect(answer).toContain('ครบ 3 ครั้ง');
		expect(mocks.callOpenRouter).not.toHaveBeenCalled();
		expect(mocks.getFinanceQueryAggregate).not.toHaveBeenCalled();
	});
});
