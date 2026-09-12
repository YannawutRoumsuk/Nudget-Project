import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	processEventOnce: vi.fn(), insertTransaction: vi.fn(), deleteLatestTransaction: vi.fn(),
	getTotals: vi.fn(), getByCategory: vi.fn(), getPaymentMethodTotal: vi.fn(), parseMessage: vi.fn(), replyText: vi.fn(),
	getPendingSlip: vi.fn(), replacePendingSlip: vi.fn(), updatePendingSlip: vi.fn(), deletePendingSlip: vi.fn(),
	getMessageContent: vi.fn(), pushText: vi.fn(), readSlip: vi.fn(), processPendingSlip: vi.fn(),
	listBills: vi.fn(), getUnpaidBillTotal: vi.fn(), getMonthlyPlan: vi.fn(),
	admit: vi.fn(), listMembers: vi.fn(), getDisplayName: vi.fn(),
	setPendingAction: vi.fn(), claimPendingAction: vi.fn(), createFeedback: vi.fn(), countFeedbackSince: vi.fn(),
	updateLatestTransactionNote: vi.fn(),
	config: { line: { allowedUserIds: ['owner'] }, ocr: { mode: 'inline' }, publicBaseUrl: 'https://nudget.example' }
}));
vi.mock('$lib/server/config', () => ({ config: mocks.config }));
vi.mock('$lib/server/access', () => ({
	admit: mocks.admit,
	isOwner: (id: string) => mocks.config.line.allowedUserIds.includes(id)
}));
vi.mock('$lib/server/db/users', () => ({
	listMembers: mocks.listMembers,
	setPendingAction: mocks.setPendingAction,
	claimPendingAction: mocks.claimPendingAction,
	pendingActionIsLive: (user: { pendingActionAt: Date | null }) => user.pendingActionAt !== null
}));
vi.mock('$lib/server/db/feedback', () => ({
	FEEDBACK_DAILY_LIMIT: 5,
	FEEDBACK_MAX_LENGTH: 1000,
	createFeedback: mocks.createFeedback,
	countFeedbackSince: mocks.countFeedbackSince
}));
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
vi.mock('$lib/server/parser', () => ({
	parseMessage: mocks.parseMessage,
	// The handler asks for a list; these tests are about the single-entry path,
	// so one outcome comes back and the multi-entry rules are covered separately
	// in tests/multi-entry.test.ts.
	parseEntries: async (text: string, now?: Date) => [await mocks.parseMessage(text, now)],
	matchCommand: (text: string) =>
		text === 'ไอดี'
			? 'whoami'
			: text === 'สมาชิก'
				? 'members'
				: text === 'ฟีดแบ็ก'
					? 'feedback'
					: text === 'มีอะไรใหม่'
						? 'release'
						: null
}));
vi.mock('../src/lib/server/line/client', () => ({
	replyText: mocks.replyText,
	pushText: mocks.pushText,
	getDisplayName: mocks.getDisplayName,
	getMessageContent: mocks.getMessageContent
}));
import { handleEvents, type LineEvent } from '../src/lib/server/line/handler';

const executor = {};
const owner = { id: 42, lineUserId: 'owner', displayName: '', pendingAction: null, pendingActionAt: null };
/** The same person, mid-way through sending feedback. */
const awaitingFeedback = { ...owner, pendingAction: 'feedback', pendingActionAt: new Date(Date.parse('2026-09-01T16:58:00Z')) };
const event: LineEvent = {
	type: 'message', replyToken: 'reply', webhookEventId: 'event-1',
	timestamp: Date.parse('2026-09-01T16:59:00Z'),
	source: { type: 'user', userId: 'owner' },
	message: { id: 'message-1', type: 'text', text: 'ข้าว 60' }
};

beforeEach(() => {
	vi.resetAllMocks();
	mocks.config.line.allowedUserIds = ['owner'];
	mocks.admit.mockImplementation(async (id: string) =>
		id === 'owner' ? { status: 'member', user: owner } : { status: 'joined', user: { id: 99, lineUserId: id, displayName: '' } }
	);
	mocks.getDisplayName.mockResolvedValue('เพื่อน');
	mocks.listMembers.mockResolvedValue([]);
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
	mocks.countFeedbackSince.mockResolvedValue(0);
	mocks.claimPendingAction.mockResolvedValue(true);
	mocks.processPendingSlip.mockResolvedValue(true);
	mocks.createFeedback.mockImplementation(async (values) => ({ id: 5, createdAt: new Date(event.timestamp!), status: 'new', resolvedAt: null, ...values }));
});

describe('LINE processing', () => {
	it('opens an account the moment someone adds the bot', async () => {
		await handleEvents([{ type: 'follow', replyToken: 'reply', source: { type: 'user', userId: 'new-user' } }]);
		expect(mocks.admit).toHaveBeenCalledWith('new-user', expect.any(Function));
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('เปิดบัญชีให้แล้ว'));
	});

	it('greets an existing member who re-adds the bot without touching their ledger', async () => {
		await handleEvents([{ type: 'follow', replyToken: 'reply', source: { type: 'user', userId: 'owner' } }]);
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('ยินดีต้อนรับสู่ Nudget'));
		expect(mocks.insertTransaction).not.toHaveBeenCalled();
	});

	it('blocks ledger access until the owner is configured', async () => {
		mocks.config.line.allowedUserIds = [];
		await handleEvents([event]);
		expect(mocks.parseMessage).not.toHaveBeenCalled();
		expect(mocks.processEventOnce).not.toHaveBeenCalled();
	});
	it('hands back the id needed to claim an unclaimed bot', async () => {
		mocks.config.line.allowedUserIds = [];
		await handleEvents([{ ...event, message: { id: 'identity', type: 'text', text: 'ไอดี' } }]);
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('owner'));
		expect(mocks.admit).not.toHaveBeenCalled();
		expect(mocks.processEventOnce).not.toHaveBeenCalled();
	});
	it('records through the transaction executor using original send time', async () => {
		await handleEvents([event]);
		expect(mocks.parseMessage).toHaveBeenCalledWith('ข้าว 60', new Date(event.timestamp!));
		expect(mocks.insertTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: '60.00', lineUserId: 'owner', userId: owner.id }), executor);
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
		expect(mocks.deleteLatestTransaction).toHaveBeenCalledWith(owner.id, executor);
	});
	it('welcomes a newcomer instead of booking their first message as an expense', async () => {
		await handleEvents([{ ...event, source: { type: 'user', userId: 'stranger' } }]);
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('เปิดบัญชีให้แล้ว'));
		expect(mocks.processEventOnce).not.toHaveBeenCalled();
	});

	it('tells the owners when a stranger opens an account', async () => {
		const joined = { id: 99, lineUserId: 'guest', displayName: 'เพื่อน', createdAt: new Date('2026-09-06T03:00:00Z') };
		mocks.admit.mockResolvedValue({ status: 'joined', user: joined });
		await handleEvents([{ ...event, source: { type: 'user', userId: 'guest' } }]);
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('เปิดบัญชีให้แล้ว'));
		expect(mocks.pushText).toHaveBeenCalledWith('owner', expect.stringContaining('เพื่อน'));
		expect(mocks.pushText).toHaveBeenCalledWith('owner', expect.stringContaining('guest'));
		expect(mocks.processEventOnce).not.toHaveBeenCalled();
	});

	it('does not announce an owner to themselves', async () => {
		const joined = { id: 42, lineUserId: 'owner', displayName: '', createdAt: new Date() };
		mocks.admit.mockResolvedValue({ status: 'joined', user: joined });
		await handleEvents([event]);
		expect(mocks.pushText).not.toHaveBeenCalled();
	});

	it('keeps the signup when announcing it fails', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.admit.mockResolvedValue({ status: 'joined', user: { id: 99, lineUserId: 'guest', displayName: '', createdAt: new Date() } });
		mocks.pushText.mockRejectedValue(new Error('LINE down'));
		await expect(handleEvents([{ ...event, source: { type: 'user', userId: 'guest' } }])).resolves.toBeUndefined();
		log.mockRestore();
	});

	it('turns away an account whose access was revoked', async () => {
		mocks.admit.mockResolvedValue({ status: 'revoked' });
		await handleEvents([{ ...event, source: { type: 'user', userId: 'guest' } }]);
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('ปิดการใช้งาน'));
		expect(mocks.processEventOnce).not.toHaveBeenCalled();
	});

	it('lists members for an owner', async () => {
		mocks.parseMessage.mockResolvedValue({ type: 'command', command: 'members' });
		mocks.listMembers.mockResolvedValue([
			{ displayName: 'เพื่อน', lineUserId: 'guest', active: true, joinedAt: new Date('2026-09-01T03:00:00Z'), transactionCount: 3, lastActivityAt: new Date('2026-09-05T03:00:00Z') }
		]);
		await handleEvents([{ ...event, message: { id: 'm', type: 'text', text: 'สมาชิก' } }]);
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('เพื่อน'));
		expect(mocks.processEventOnce).not.toHaveBeenCalled();
	});

	it('hands out the dashboard link, which is how iPad and desktop reach it', async () => {
		mocks.config.publicBaseUrl = 'https://nudget.example';
		mocks.parseMessage.mockResolvedValue({ type: 'command', command: 'web' });
		await handleEvents([event]);
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('https://nudget.example'));
	});

	it('refuses the member list to anyone who is not an owner', async () => {
		mocks.admit.mockResolvedValue({ status: 'member', user: { id: 99, lineUserId: 'guest', displayName: '' } });
		await handleEvents([{ ...event, source: { type: 'user', userId: 'guest' }, message: { id: 'm', type: 'text', text: 'สมาชิก' } }]);
		expect(mocks.listMembers).not.toHaveBeenCalled();
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('เฉพาะเจ้าของ'));
	});
	it('writes a second member into its own ledger', async () => {
		mocks.admit.mockResolvedValue({ status: 'member', user: { id: 99, lineUserId: 'partner', displayName: '' } });
		await handleEvents([{ ...event, source: { type: 'user', userId: 'partner' } }]);
		expect(mocks.getPendingSlip).toHaveBeenCalledWith(99);
		expect(mocks.insertTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 99, lineUserId: 'partner' }),
			executor
		);
	});

	it('accepts an image and starts slip OCR after replying immediately', async () => {
		mocks.replacePendingSlip.mockResolvedValue({ slip: { id: 7, lineUserId: 'owner', messageId: 'image-1', status: 'queued' }, replaced: null });
		mocks.getMessageContent.mockReturnValue(new Promise(() => {}));
		await handleEvents([{ ...event, message: { id: 'image-1', type: 'image' } }]);
		expect(mocks.replacePendingSlip).toHaveBeenCalledWith(
			expect.objectContaining({ userId: owner.id, lineUserId: 'owner', messageId: 'image-1' }),
			executor
		);
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
		expect(mocks.deletePendingSlip).toHaveBeenCalledWith(owner.id, executor);
	});
});

describe('feedback in chat', () => {
	const say = (text: string) => handleEvents([{ ...event, message: { id: 'm', type: 'text', text } }]);

	it('asks for the message rather than storing the command itself', async () => {
		mocks.parseMessage.mockResolvedValue({ type: 'command', command: 'feedback' });
		await say('ฟีดแบ็ก');
		expect(mocks.setPendingAction).toHaveBeenCalledWith(owner.id, 'feedback', executor);
		expect(mocks.createFeedback).not.toHaveBeenCalled();
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('อยากบอกอะไร'));
	});

	it('stores the next message and tells the owner, without recording an expense', async () => {
		mocks.admit.mockResolvedValue({ status: 'member', user: awaitingFeedback });
		await say('แอปช้ามาก จ่ายไป 500');
		expect(mocks.createFeedback).toHaveBeenCalledWith(
			expect.objectContaining({ userId: owner.id, message: 'แอปช้ามาก จ่ายไป 500' }),
			executor
		);
		expect(mocks.insertTransaction).not.toHaveBeenCalled();
		expect(mocks.claimPendingAction).toHaveBeenCalledWith(owner.id, 'feedback', executor);
		expect(mocks.pushText).toHaveBeenCalledWith('owner', expect.stringContaining('แอปช้ามาก'));
	});

	it('drops feedback mode when a slip arrives, so the answer about it is not filed as a complaint', async () => {
		mocks.admit.mockResolvedValue({ status: 'member', user: awaitingFeedback });
		mocks.replacePendingSlip.mockResolvedValue({
			slip: { id: 9, lineUserId: 'owner', messageId: 'image-3', status: 'queued' },
			replaced: null
		});
		await handleEvents([{ ...event, message: { id: 'image-3', type: 'image' } }]);
		expect(mocks.setPendingAction).toHaveBeenCalledWith(owner.id, null, executor);
	});

	it('refuses to start feedback while a read slip is still waiting for an answer', async () => {
		mocks.getPendingSlip.mockResolvedValue({ id: 3, status: 'ready', amount: '120.00', ocrText: 'สลิป' });
		mocks.parseMessage.mockResolvedValue({ type: 'command', command: 'feedback' });
		await say('ฟีดแบ็ก');
		expect(mocks.setPendingAction).not.toHaveBeenCalled();
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('สลิปที่อ่านเสร็จรออยู่'));
	});

	it('stays silent when a concurrent delivery already answered', async () => {
		mocks.admit.mockResolvedValue({ status: 'member', user: awaitingFeedback });
		mocks.claimPendingAction.mockResolvedValue(false);
		await say('ส่งซ้ำ');
		expect(mocks.createFeedback).not.toHaveBeenCalled();
		expect(mocks.replyText).not.toHaveBeenCalled();
	});

	it('lets someone back out without storing anything', async () => {
		mocks.admit.mockResolvedValue({ status: 'member', user: awaitingFeedback });
		await say('ยกเลิก');
		expect(mocks.createFeedback).not.toHaveBeenCalled();
		expect(mocks.claimPendingAction).toHaveBeenCalledWith(owner.id, 'feedback', executor);
	});

	it('refuses a sixth message in a day and still releases the mode', async () => {
		mocks.admit.mockResolvedValue({ status: 'member', user: awaitingFeedback });
		mocks.countFeedbackSince.mockResolvedValue(5);
		await say('อีกเรื่องนึง');
		expect(mocks.createFeedback).not.toHaveBeenCalled();
		expect(mocks.claimPendingAction).toHaveBeenCalledWith(owner.id, 'feedback', executor);
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('ถี่ไป'));
	});

	it('attaches a remark to the entry that was just recorded', async () => {
		mocks.parseMessage.mockResolvedValue({ type: 'command', command: { command: 'note', text: 'ข้าวมันไก่ มื้อเที่ยง' } });
		mocks.updateLatestTransactionNote.mockResolvedValue({
			id: 1, kind: 'expense', amount: '60.00', categoryId: 'food', note: 'ข้าวมันไก่ มื้อเที่ยง'
		});
		await say('โน้ต ข้าวมันไก่ มื้อเที่ยง');
		expect(mocks.updateLatestTransactionNote).toHaveBeenCalledWith(owner.id, 'ข้าวมันไก่ มื้อเที่ยง', executor);
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('ข้าวมันไก่ มื้อเที่ยง'));
	});

	it('says there is nothing to annotate when the ledger is empty', async () => {
		mocks.parseMessage.mockResolvedValue({ type: 'command', command: { command: 'note', text: 'ลืมใส่' } });
		mocks.updateLatestTransactionNote.mockResolvedValue(null);
		await say('โน้ต ลืมใส่');
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('ยังไม่มีรายการ'));
	});

	it('shows what is new on request', async () => {
		mocks.parseMessage.mockResolvedValue({ type: 'command', command: 'release' });
		await say('มีอะไรใหม่');
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('มีอะไรใหม่'));
	});
});

describe('after a slip could not be read', () => {
	it('records what the user types by hand as their own entry, not as OCR output', async () => {
		mocks.getPendingSlip.mockResolvedValue({ id: 4, status: 'failed', amount: null, occurredAt: null, ocrText: '' });
		await handleEvents([event]);
		expect(mocks.deletePendingSlip).toHaveBeenCalledWith(owner.id, executor);
		expect(mocks.insertTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ parsedBy: 'rule', rawText: 'ข้าว 60' }),
			executor
		);
	});
});

describe('slips sent on top of each other', () => {
	it('says the earlier slip was dropped so two later replies cannot be confused', async () => {
		mocks.replacePendingSlip.mockResolvedValue({
			slip: { id: 8, lineUserId: 'owner', messageId: 'image-2', status: 'queued' },
			replaced: { id: 7, lineUserId: 'owner', messageId: 'image-1', status: 'processing' }
		});
		mocks.getMessageContent.mockReturnValue(new Promise(() => {}));
		await handleEvents([{ ...event, message: { id: 'image-2', type: 'image' } }]);
		expect(mocks.replyText).toHaveBeenCalledWith('reply', expect.stringContaining('ยกเลิกสลิปใบก่อนหน้า'));
		expect(mocks.processPendingSlip).toHaveBeenCalledWith(8);
	});
});
