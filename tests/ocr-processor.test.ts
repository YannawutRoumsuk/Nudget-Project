import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	claimPendingSlip: vi.fn(),
	updatePendingSlip: vi.fn(),
	getMessageContent: vi.fn(),
	pushQuickReplies: vi.fn(),
	pushText: vi.fn(),
	readSlip: vi.fn()
}));

vi.mock('$lib/server/db/slips', () => ({
	claimPendingSlip: mocks.claimPendingSlip,
	updatePendingSlip: mocks.updatePendingSlip
}));
vi.mock('$lib/server/line/client', () => ({
	getMessageContent: mocks.getMessageContent,
	pushQuickReplies: mocks.pushQuickReplies,
	pushText: mocks.pushText
}));
vi.mock('$lib/server/ocr/slip', () => ({ readSlip: mocks.readSlip }));

import { processClaimedSlip } from '../src/lib/server/ocr/processor';

const pending = {
	id: 7,
	userId: 42,
	lineUserId: 'line-user',
	messageId: 'image-1',
	status: 'processing' as const,
	amount: null,
	occurredAt: null,
	categoryId: 'other',
	paymentMethod: 'bank' as const,
	note: '',
	recipient: '',
	reference: '',
	ocrText: '',
	ocrProvider: 'tesseract',
	amountConfidence: null,
	dateConfidence: null,
	recipientConfidence: null,
	fingerprint: null,
	expiresAt: new Date('2099-01-01T00:00:00Z'),
	createdAt: new Date(),
	updatedAt: new Date()
};

describe('OCR duplicate fingerprint', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.getMessageContent.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
		mocks.readSlip.mockResolvedValue({
			amount: 120,
			occurredAt: new Date('2026-09-12T06:42:00Z'),
			recipient: 'ร้านกาแฟ',
			reference: 'REF-123',
			text: 'สลิป 120 บาท',
			provider: 'gemini',
			confidence: { amount: 0.99, date: 0.95, recipient: 0.8 }
		});
		mocks.updatePendingSlip.mockImplementation(async (_id, values) => ({ ...pending, ...values }));
	});

	it('stores a stable fingerprint before showing the review card', async () => {
		await processClaimedSlip(pending);
		expect(mocks.updatePendingSlip).toHaveBeenCalledWith(7, expect.objectContaining({
			status: 'ready',
			ocrProvider: 'gemini',
			amountConfidence: '0.99',
			fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
		}));
		expect(mocks.pushQuickReplies).toHaveBeenCalledWith(
			'line-user',
			expect.stringContaining('ตรวจสอบรายการ'),
			expect.any(Array)
		);
	});
});
