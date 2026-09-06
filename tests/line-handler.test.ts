import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	processEventOnce: vi.fn(), insertTransaction: vi.fn(), deleteLatestTransaction: vi.fn(),
	getTotals: vi.fn(), getByCategory: vi.fn(), getPaymentMethodTotal: vi.fn(), parseMessage: vi.fn(), replyText: vi.fn(),
	getPendingSlip: vi.fn(), replacePendingSlip: vi.fn(), updatePendingSlip: vi.fn(), deletePendingSlip: vi.fn(),
	getMessageContent: vi.fn(), pushText: vi.fn(), readSlip: vi.fn(), processPendingSlip: vi.fn(),
	listBills: vi.fn(), getUnpaidBillTotal: vi.fn(), getMonthlyPlan: vi.fn(),
	config: { line: { allowedUserId: 'owner' }, ocr: { mode: 'inline' } }
}));
vi.mock('$lib/server/config', () => ({ config: mocks.config }));
vi.mock('$lib/server/db/queries', () => mocks);
vi.mock('$lib/server/db/slips', () => ({
	getPendingSlip: mocks.getPendingSlip,
	replacePendingSlip: mocks.replacePendingSlip,
	updatePendingSlip: mocks.updatePendingSlip,
	deletePendingSlip: mocks.deletePendingSlip
}));
vi.mock('$lib/server/db/bills', () => ({ listBills: mocks.listBills, getUnpaidBillTotal: mocks.getUnpaidBillTotal }));
vi.mock('$lib/server/db/plans', () => ({ getMonthlyPlan: mocks.getMonthlyPlan }));
vi.mock('$lib/server/ocr/slip', () => ({ readSlip: mocks.readSlip }));
vi.mock('$lib/server/ocr/processor', () => ({ processPendingSlip: mocks.processPendingSlip }));
vi.mock('$lib/server/parser', () => ({ parseMessage: mocks.parseMessage, matchCommand: (text: string) => text === 'ไอดี' ? 'whoami' : null }));
vi.mock('../src/lib/server/line/client', () => ({
	replyText: mocks.replyText,
	pushText: mocks.pushText,
	getMessageContent: mocks.getMessageContent
}));
import { handleEvents, type LineEvent } from '../src/lib/server/line/handler';

const executor = {};
const event: LineEvent = {
	type: 'message', replyToken: 'reply', webhookEventId: 'event-1',
	timestamp: Date.parse('2026-09-01T16:59:00Z'),
	source: { type: 'user', userId: 'owner' },
	message: { id: 'message-1', type: 'text', text: 'ข้าว 60' }
};

beforeEach(() => {
	vi.resetAllMocks();
	mocks.config.line.allowedUserId = 'owner';
	mocks.parseMessage.mockResolvedValue({ type: 'transaction', tx: {
		kind: 'expense', amount: 60, categoryId: 'food', note: 'ข้าว',
		occurredAt: new Date(event.timestamp!), parsedBy: 'rule'
	} });
	mocks.processEventOnce.mockImplementation((_id, work) => work(executor));
	mocks.insertTransaction.mockImplementation(async (tx) => ({ id: 1, ...tx }));
	mocks.getPendingSlip.mockResolvedValue(null);
	mocks.listBills.mockResolvedValue([]);
	mocks.getUnpaidBillTotal.mockResolvedValue(0);
	mocks.getMonthlyPlan.mockResolvedValue(null);
	mocks.getPaymentMethodTotal.mockResolvedValue(0);
});

describe('LINE processing', () => {
	it('sends a short getting-started message when a user adds the bot', async () => {
		await handleEvents([{ type: 'follow', replyToken: 'reply', source: { type: 'user', userId: 'new-user' } }]);
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('เริ่มง่าย ๆ'));
	});

	it('blocks ledger access until the owner is configured', async () => {
		mocks.config.line.allowedUserId = '';
		await handleEvents([event]);
		expect(mocks.parseMessage).not.toHaveBeenCalled();
		expect(mocks.processEventOnce).not.toHaveBeenCalled();
	});
	it('allows identity setup without a database or owner', async () => {
		mocks.config.line.allowedUserId = '';
		await handleEvents([{ ...event, message: { id: 'identity', type: 'text', text: 'ไอดี' } }]);
		expect(mocks.replyText).toHaveBeenCalledWith('reply', 'LINE userId ของคุณคือ\nowner');
		expect(mocks.processEventOnce).not.toHaveBeenCalled();
	});
	it('records through the transaction executor using original send time', async () => {
		await handleEvents([event]);
		expect(mocks.parseMessage).toHaveBeenCalledWith('ข้าว 60', new Date(event.timestamp!));
		expect(mocks.insertTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: '60.00', lineUserId: 'owner' }), executor);
		expect(mocks.replyText).toHaveBeenCalledOnce();
	});
	it('does not mutate or reply again for a committed duplicate', async () => {
		mocks.processEventOnce.mockResolvedValue(null);
		await handleEvents([event]);
		expect(mocks.insertTransaction).not.toHaveBeenCalled();
		expect(mocks.replyText).not.toHaveBeenCalled();
	});
	it('propagates storage failure and stops the batch before later commands', async () => {
		mocks.insertTransaction.mockRejectedValue(new Error('offline'));
		await expect(handleEvents([event, { ...event, webhookEventId: 'event-2' }])).rejects.toThrow('offline');
		expect(mocks.processEventOnce).toHaveBeenCalledOnce();
		expect(mocks.replyText).not.toHaveBeenCalled();
	});
	it('keeps committed data when confirmation times out', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.replyText.mockRejectedValue(new Error('timeout'));
		await expect(handleEvents([event])).resolves.toBeUndefined();
		expect(mocks.insertTransaction).toHaveBeenCalledOnce();
		log.mockRestore();
	});
	it('deduplicates undo in the same transaction as its deletion', async () => {
		mocks.parseMessage.mockResolvedValue({ type: 'command', command: 'undo' });
		mocks.deleteLatestTransaction.mockResolvedValue(null);
		await handleEvents([event]);
		expect(mocks.deleteLatestTransaction).toHaveBeenCalledWith(executor);
	});
	it('rejects another user before parsing or opening a transaction', async () => {
		await handleEvents([{ ...event, source: { type: 'user', userId: 'stranger' } }]);
		expect(mocks.parseMessage).not.toHaveBeenCalled();
		expect(mocks.processEventOnce).not.toHaveBeenCalled();
	});

	it('accepts an image and starts slip OCR after replying immediately', async () => {
		mocks.replacePendingSlip.mockResolvedValue({ id: 7, lineUserId: 'owner', messageId: 'image-1', status: 'queued' });
		mocks.getMessageContent.mockReturnValue(new Promise(() => {}));
		await handleEvents([{ ...event, message: { id: 'image-1', type: 'image' } }]);
		expect(mocks.replacePendingSlip).toHaveBeenCalled();
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('รับสลิปแล้ว'));
		expect(mocks.processPendingSlip).toHaveBeenCalledWith(7);
	});

	it('uses the OCR amount when the slip follow-up only describes the expense', async () => {
		mocks.getPendingSlip.mockResolvedValue({ id: 7, lineUserId: 'owner', messageId: 'image-1', status: 'ready', amount: '100.00', occurredAt: null, ocrText: 'จำนวนเงิน 100.00 บาท' });
		mocks.parseMessage
			.mockResolvedValueOnce({ type: 'unknown', text: 'ค่าอาหาร' })
			.mockResolvedValueOnce({ type: 'transaction', tx: { kind: 'expense', amount: 100, categoryId: 'food', note: 'ค่าอาหาร', occurredAt: new Date(event.timestamp!), parsedBy: 'rule' } });
		await handleEvents([{ ...event, message: { id: 'message-2', type: 'text', text: 'ค่าอาหาร' } }]);
		expect(mocks.parseMessage).toHaveBeenNthCalledWith(2, 'ค่าอาหาร 100.00', new Date(event.timestamp!));
		expect(mocks.insertTransaction).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'bank', parsedBy: 'ocr' }), executor);
		expect(mocks.deletePendingSlip).toHaveBeenCalledWith('owner', executor);
	});
});
