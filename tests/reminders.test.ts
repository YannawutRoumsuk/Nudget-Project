import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	listUsers: vi.fn(), listBills: vi.fn(), pushText: vi.fn(),
	claimReminderDelivery: vi.fn(), releaseReminderDelivery: vi.fn(),
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

import { runReminderCheck, shouldRemind } from '../src/lib/server/reminders';
import { fromBangkok } from '../src/lib/utils/date';

const now = fromBangkok(2026, 9, 7, 9);

function bill(id: number, name: string) {
	return { id, name, amount: 500, recurrence: 'once' as const, dueDay: null, dueDate: fromBangkok(2026, 9, 10, 9), paid: false, active: true };
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.config.line.accessToken = 'token';
	mocks.claimReminderDelivery.mockResolvedValue(true);
	mocks.pushText.mockResolvedValue(true);
});

describe('bill reminders', () => {
	it('matches the Bangkok calendar day exactly', () => {
		const due = fromBangkok(2026, 9, 10, 9);
		expect(shouldRemind(due, fromBangkok(2026, 9, 7, 8), 3)).toBe(true);
		expect(shouldRemind(due, fromBangkok(2026, 9, 8, 0), 3)).toBe(false);
	});

	it('sends each account only its own bills', async () => {
		mocks.listUsers.mockResolvedValue([
			{ id: 1, lineUserId: 'owner' },
			{ id: 2, lineUserId: 'partner' }
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
		mocks.listUsers.mockResolvedValue([{ id: 2, lineUserId: 'partner' }]);
		mocks.listBills.mockResolvedValue([bill(20, 'ค่าน้ำ')]);
		await runReminderCheck(now);
		expect(mocks.claimReminderDelivery).toHaveBeenCalledWith(expect.stringContaining('20:'), 2);
	});

	it('keeps delivering to other accounts when one push fails', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.listUsers.mockResolvedValue([
			{ id: 1, lineUserId: 'owner' },
			{ id: 2, lineUserId: 'partner' }
		]);
		mocks.listBills.mockResolvedValue([bill(10, 'ค่าไฟ')]);
		mocks.pushText.mockRejectedValueOnce(new Error('LINE down'));

		await expect(runReminderCheck(now)).rejects.toThrow('LINE down');
		expect(mocks.pushText).toHaveBeenCalledWith('partner', expect.stringContaining('ค่าไฟ'));
		expect(mocks.releaseReminderDelivery).toHaveBeenCalledOnce();
		log.mockRestore();
	});
});
