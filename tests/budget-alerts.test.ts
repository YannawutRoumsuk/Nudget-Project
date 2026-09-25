import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getMonthlyCategoryBudgets: vi.fn(), getMonthlyPlan: vi.fn(), listBills: vi.fn(), getByCategory: vi.fn(),
	claimReminderDelivery: vi.fn(), releaseReminderDelivery: vi.fn(), pushText: vi.fn()
}));

vi.mock('../src/lib/server/db/plans', () => ({
	getMonthlyCategoryBudgets: mocks.getMonthlyCategoryBudgets,
	getMonthlyPlan: mocks.getMonthlyPlan
}));
vi.mock('../src/lib/server/db/bills', () => ({ listBills: mocks.listBills }));
vi.mock('../src/lib/server/db/queries', () => ({
	getByCategory: mocks.getByCategory,
	claimReminderDelivery: mocks.claimReminderDelivery,
	releaseReminderDelivery: mocks.releaseReminderDelivery
}));
vi.mock('../src/lib/server/line/client', () => ({ pushText: mocks.pushText }));

import { sendBudgetThresholdAlerts } from '../src/lib/server/budget-alerts';
import { fromBangkok } from '../src/lib/utils/date';

beforeEach(() => {
	vi.resetAllMocks();
	mocks.getMonthlyPlan.mockResolvedValue({ budgetAlertsEnabled: true });
	mocks.getMonthlyCategoryBudgets.mockResolvedValue([
		{ categoryId: 'food', amount: '6000.00' }, { categoryId: 'transport', amount: '1000.00' }
	]);
	mocks.listBills.mockResolvedValue([]);
	mocks.getByCategory.mockResolvedValue([{ categoryId: 'food', total: 5000 }, { categoryId: 'transport', total: 500 }]);
	mocks.claimReminderDelivery.mockResolvedValue(true);
	mocks.pushText.mockResolvedValue(true);
});

describe('monthly category budget alerts', () => {
	it('groups thresholds and claims each user/category/threshold only once', async () => {
		const now = fromBangkok(2026, 9, 10, 9);
		await sendBudgetThresholdAlerts(7, 'line-user', now);
		expect(mocks.claimReminderDelivery).toHaveBeenCalledWith('budget:2026-09:food:50', 7);
		expect(mocks.claimReminderDelivery).toHaveBeenCalledWith('budget:2026-09:food:80', 7);
		expect(mocks.claimReminderDelivery).toHaveBeenCalledTimes(3);
		expect(mocks.pushText).toHaveBeenCalledOnce();
		expect(mocks.pushText.mock.calls[0]?.[1]).toContain('อาหาร: 50% / 80%');
	});

	it('does not send or claim after alerts are disabled', async () => {
		mocks.getMonthlyPlan.mockResolvedValue({ budgetAlertsEnabled: false });
		await sendBudgetThresholdAlerts(7, 'line-user', fromBangkok(2026, 9, 10, 9));
		expect(mocks.getMonthlyCategoryBudgets).not.toHaveBeenCalled();
		expect(mocks.claimReminderDelivery).not.toHaveBeenCalled();
		expect(mocks.pushText).not.toHaveBeenCalled();
	});

	it('releases threshold claims when LINE rejects the notification', async () => {
		mocks.pushText.mockResolvedValue(false);
		await sendBudgetThresholdAlerts(7, 'line-user', fromBangkok(2026, 9, 10, 9));
		expect(mocks.releaseReminderDelivery).toHaveBeenCalledWith('budget:2026-09:food:50');
		expect(mocks.releaseReminderDelivery).toHaveBeenCalledWith('budget:2026-09:food:80');
	});

	it('adds unpaid ordinary bills to their category but does not count card settlement twice', async () => {
		mocks.getMonthlyCategoryBudgets.mockResolvedValue([
			{ categoryId: 'food', amount: '6000.00' }, { categoryId: 'transport', amount: '1000.00' }
		]);
		mocks.getByCategory.mockResolvedValue([{ categoryId: 'food', total: 2800 }]);
		mocks.listBills.mockResolvedValue([
			{ id: 1, name: 'ค่ากับข้าว', categoryId: 'food', amount: 400, dueDate: fromBangkok(2026, 9, 20, 9), recurrence: 'once', paid: false, noExpenseOnPay: false },
			{ id: 2, name: 'ยอดบัตร', categoryId: 'transport', amount: 900, dueDate: fromBangkok(2026, 9, 20, 9), recurrence: 'once', paid: false, noExpenseOnPay: true }
		]);
		await sendBudgetThresholdAlerts(7, 'line-user', fromBangkok(2026, 9, 10, 9));
		expect(mocks.claimReminderDelivery).toHaveBeenCalledWith('budget:2026-09:food:50', 7);
		expect(mocks.claimReminderDelivery).not.toHaveBeenCalledWith('budget:2026-09:transport:80', 7);
		expect(mocks.pushText).toHaveBeenCalledOnce();
		expect(mocks.pushText.mock.calls[0]?.[1]).toContain('อาหาร');
		expect(mocks.pushText.mock.calls[0]?.[1]).not.toContain('เดินทาง');
	});
});
