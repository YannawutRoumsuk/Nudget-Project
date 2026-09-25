import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	listUsers: vi.fn(), listBills: vi.fn(), pushText: vi.fn(),
	claimReminderDelivery: vi.fn(), releaseReminderDelivery: vi.fn(),
	buildMonthlyLineSummary: vi.fn(),
	sendBudgetThresholdAlerts: vi.fn(),
	config: { line: { accessToken: 'token' }, reminders: { daysBefore: 3, hour: 9 } }
}));
vi.mock('$lib/server/config', () => ({ config: mocks.config }));
vi.mock('../src/lib/server/db/users', () => ({ listUsers: mocks.listUsers }));
vi.mock('../src/lib/server/db/bills', () => ({ listBills: mocks.listBills }));
vi.mock('../src/lib/server/db/queries', () => ({
	claimReminderDelivery: mocks.claimReminderDelivery,
	releaseReminderDelivery: mocks.releaseReminderDelivery
}));
vi.mock('../src/lib/server/line/client', () => ({ pushText: mocks.pushText }));
vi.mock('../src/lib/server/monthly-summary', () => ({ buildMonthlyLineSummary: mocks.buildMonthlyLineSummary }));
vi.mock('../src/lib/server/budget-alerts', () => ({ sendBudgetThresholdAlerts: mocks.sendBudgetThresholdAlerts }));

import { inactivityReminderKey, runReminderCheck, shouldRemind } from '../src/lib/server/reminders';
import { fromBangkok } from '../src/lib/utils/date';

const now = fromBangkok(2026, 9, 7, 9);

function user(id: number, lineUserId: string, lastActivityAt = fromBangkok(2026, 9, 7, 8)) {
	return {
		id, lineUserId, lastActivityAt, notificationsEnabled: true, notificationHour: 9,
		timezone: 'Asia/Bangkok', quietHoursStart: 22, quietHoursEnd: 7
	};
}

function bill(id: number, name: string) {
	return { id, name, amount: 500, recurrence: 'once' as const, dueDay: null, dueDate: fromBangkok(2026, 9, 10, 9), paid: false, active: true };
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.config.line.accessToken = 'token';
	mocks.claimReminderDelivery.mockResolvedValue(true);
	mocks.pushText.mockResolvedValue(true);
	mocks.buildMonthlyLineSummary.mockResolvedValue({ text: 'สรุปเดือนก่อน', hasData: true, usedAi: true });
});

describe('monthly close', () => {
	it('pushes the previous month once on Bangkok day one', async () => {
		const first = fromBangkok(2026, 10, 1, 9);
		mocks.listUsers.mockResolvedValue([user(1, 'owner')]);
		mocks.listBills.mockResolvedValue([]);
		await runReminderCheck(first);
		expect(mocks.buildMonthlyLineSummary).toHaveBeenCalledWith(1, '2026-09', first, { claimQuota: false });
		expect(mocks.claimReminderDelivery).toHaveBeenCalledWith('monthly-summary:1:2026-09', 1);
		expect(mocks.pushText).toHaveBeenCalledWith('owner', 'สรุปเดือนก่อน');
	});
});

describe('bill reminders', () => {
	it('matches the Bangkok calendar day exactly', () => {
		const due = fromBangkok(2026, 9, 10, 9);
		expect(shouldRemind(due, fromBangkok(2026, 9, 7, 8), 3)).toBe(true);
		expect(shouldRemind(due, fromBangkok(2026, 9, 8, 0), 3)).toBe(false);
	});

	it('sends each account only its own bills', async () => {
		mocks.listUsers.mockResolvedValue([
			user(1, 'owner'),
			user(2, 'partner')
		]);
		mocks.listBills.mockImplementation(async (userId: number) =>
			userId === 1 ? [bill(10, 'ค่าไฟ')] : [bill(20, 'ค่าน้ำ')]
		);

		await runReminderCheck(now);

		expect(mocks.listBills).toHaveBeenCalledWith(1, now);
		expect(mocks.listBills).toHaveBeenCalledWith(2, now);
		expect(mocks.pushText).toHaveBeenCalledWith('owner', expect.stringContaining('ค่าไฟ'));
		expect(mocks.pushText).toHaveBeenCalledWith('partner', expect.stringContaining('ค่าน้ำ'));
		expect(mocks.pushText).not.toHaveBeenCalledWith('owner', expect.stringContaining('ค่าน้ำ'));
	});

	it('claims the delivery under the owning account', async () => {
		mocks.listUsers.mockResolvedValue([user(2, 'partner')]);
		mocks.listBills.mockResolvedValue([bill(20, 'ค่าน้ำ')]);
		await runReminderCheck(now);
		expect(mocks.claimReminderDelivery).toHaveBeenCalledWith(expect.stringContaining('20:'), 2);
	});

	it('sends an additional single reminder on the due date', async () => {
		mocks.listUsers.mockResolvedValue([user(2, 'partner')]);
		mocks.listBills.mockResolvedValue([bill(20, 'ค่าน้ำ')]);
		await runReminderCheck(fromBangkok(2026, 9, 10, 9));
		expect(mocks.claimReminderDelivery).toHaveBeenCalledWith('20:2026-09-10:0', 2);
		expect(mocks.pushText).toHaveBeenCalledWith('partner', expect.stringContaining('ครบกำหนดวันนี้'));
	});

	it('keeps delivering to other accounts when one push fails', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.listUsers.mockResolvedValue([
			user(1, 'owner'),
			user(2, 'partner')
		]);
		mocks.listBills.mockResolvedValue([bill(10, 'ค่าไฟ')]);
		mocks.pushText.mockRejectedValueOnce(new Error('LINE down'));

		await expect(runReminderCheck(now)).rejects.toThrow('LINE down');
		expect(mocks.pushText).toHaveBeenCalledWith('partner', expect.stringContaining('ค่าไฟ'));
		expect(mocks.releaseReminderDelivery).toHaveBeenCalledOnce();
		log.mockRestore();
	});

	it('sends inactivity reminders every six hours but stops at 72 hours', () => {
		const lastActivityAt = fromBangkok(2026, 9, 7, 3);
		expect(inactivityReminderKey({ id: 5, lastActivityAt }, fromBangkok(2026, 9, 7, 9))).toBe(`inactive:5:${lastActivityAt.getTime()}:1`);
		expect(inactivityReminderKey({ id: 5, lastActivityAt }, fromBangkok(2026, 9, 10, 3))).toBeNull();
	});

	it('does not send reminders to a disabled account or during quiet hours', async () => {
		const inactive = user(3, 'quiet', fromBangkok(2026, 9, 7, 1));
		mocks.listUsers.mockResolvedValue([{ ...inactive, quietHoursStart: 22, quietHoursEnd: 7 }]);
		await runReminderCheck(fromBangkok(2026, 9, 7, 23));
		expect(mocks.pushText).not.toHaveBeenCalled();

		mocks.listUsers.mockResolvedValue([{ ...inactive, notificationsEnabled: false }]);
		await runReminderCheck(fromBangkok(2026, 9, 7, 9));
		expect(mocks.pushText).not.toHaveBeenCalled();
	});
});
