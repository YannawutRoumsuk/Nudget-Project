import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	callOpenRouter: vi.fn(),
	claimLlmCall: vi.fn(),
	llmCallsUsed: vi.fn(),
	recordLlmUsage: vi.fn(),
	releaseLlmCall: vi.fn(),
	createAiConversation: vi.fn(),
	recentAiConversations: vi.fn(),
	config: {
		llm: {
			provider: 'openrouter' as const,
			apiKey: 'test-key', model: 'google/gemini-2.5-flash-lite', helpModel: 'google/gemini-3.8-flash',
			helpDailyLimit: 5, helpMaxInputChars: 600, helpMaxOutputTokens: 1200, timeoutMs: 8000
		}
	}
}));

vi.mock('$lib/server/config', () => ({ config: mocks.config }));
vi.mock('$lib/server/llm/openrouter', () => ({ callOpenRouter: mocks.callOpenRouter }));
vi.mock('$lib/server/db/quota', () => ({
	claimLlmCall: mocks.claimLlmCall,
	llmCallsUsed: mocks.llmCallsUsed,
	recordLlmUsage: mocks.recordLlmUsage,
	releaseLlmCall: mocks.releaseLlmCall
}));
vi.mock('$lib/server/db/ai-conversations', () => ({
	createAiConversation: mocks.createAiConversation,
	recentAiConversations: mocks.recentAiConversations
}));

import { answerAiHelp } from '../src/lib/server/help/generate';

beforeEach(() => {
	vi.resetAllMocks();
	mocks.claimLlmCall.mockResolvedValue(true);
	mocks.llmCallsUsed.mockResolvedValue(1);
	mocks.recentAiConversations.mockResolvedValue([]);
	mocks.callOpenRouter.mockResolvedValue({ text: '**ไปที่หน้าแผนเดือน** แล้วพิมพ์ `รายรับ 30000`', inputTokens: 220, outputTokens: 24 });
	mocks.releaseLlmCall.mockResolvedValue(undefined);
});

describe('AI help', () => {
	it('answers with the real provider, reports remaining quota, and records the disclosed transcript', async () => {
		const result = await answerAiHelp(7, 'ตั้งงบยังไง');
		expect(mocks.callOpenRouter).toHaveBeenCalledWith(expect.objectContaining({
			model: 'google/gemini-3.8-flash',
			maxOutputTokens: 1200,
			reasoning: { effort: 'minimal', exclude: true }
		}));
		expect(result.text).toContain('เหลือถาม AI ได้ 4 ครั้งวันนี้');
		expect(mocks.createAiConversation).toHaveBeenCalledWith(expect.objectContaining({
			userId: 7, userMessage: 'ตั้งงบยังไง', assistantMessage: 'ไปที่หน้าแผนเดือน แล้วพิมพ์ รายรับ 30000'
		}));
		expect(mocks.recordLlmUsage).toHaveBeenCalledWith(expect.objectContaining({ workflow: 'help', success: true }));
	});

	it('does not call the provider after the daily limit', async () => {
		mocks.claimLlmCall.mockResolvedValue(false);
		const result = await answerAiHelp(7, 'ถามต่อ');
		expect(result.text).toContain('ครบ 5 ครั้ง');
		expect(mocks.callOpenRouter).not.toHaveBeenCalled();
		expect(mocks.createAiConversation).toHaveBeenCalled();
	});

	it('refunds quota when the provider fails', async () => {
		mocks.callOpenRouter.mockRejectedValue(new Error('provider_429'));
		const result = await answerAiHelp(7, 'เปิดเว็บยังไง');
		expect(mocks.releaseLlmCall).toHaveBeenCalledWith(7, expect.any(Date), 'help');
		expect(result.text).toContain('ตอบไม่ได้ชั่วคราว');
	});
});
