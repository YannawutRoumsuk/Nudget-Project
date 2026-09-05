import { billDueDate } from '$lib/bills';
import { bangkokDayStart, addDays, bangkokDayKey, fromBangkok, bangkokParts } from '$lib/utils/date';
import { listBills } from './db/bills';
import { claimReminderDelivery, releaseReminderDelivery } from './db/queries';
import { config } from './config';
import { pushText } from './line/client';

export function reminderKey(billId: number, dueDate: Date): string {
	return `${billId}:${bangkokDayKey(dueDate)}:${config.reminders.daysBefore}`;
}

export function shouldRemind(dueDate: Date, now: Date, daysBefore: number): boolean {
	const target = bangkokDayStart(addDays(dueDate, -daysBefore)).getTime();
	const today = bangkokDayStart(now).getTime();
	return today === target;
}

export async function runReminderCheck(now = new Date()): Promise<void> {
	if (!config.line.accessToken || !config.line.allowedUserId) return;
	const bills = await listBills(now);
	const due = bills.filter((bill) => {
		const date = billDueDate(bill, now);
		return !bill.paid && date && shouldRemind(date, now, config.reminders.daysBefore);
	});
	for (const bill of due) {
		const dueDate = billDueDate(bill, now)!;
		const key = reminderKey(bill.id, dueDate);
		if (!(await claimReminderDelivery(key))) continue;
		const { day, month, year } = bangkokParts(dueDate);
		try {
			const sent = await pushText(config.line.allowedUserId, `🔔 เตือนบิล\n${bill.name} ${bill.amount.toLocaleString('th-TH')} บาท\nครบกำหนด ${day}/${month}/${year}`);
			if (!sent) await releaseReminderDelivery(key);
		} catch (error) {
			await releaseReminderDelivery(key);
			throw error;
		}
	}
}

export function startReminderWorker(): () => void {
	let stopped = false;
	const tick = () => { if (!stopped) void runReminderCheck().catch((error) => console.error('[reminders]', error)); };
	const now = new Date();
	const { year, month, day } = bangkokParts(now);
	const next = fromBangkok(year, month, day + (bangkokParts(now).hour > config.reminders.hour ? 1 : 0), config.reminders.hour);
	const timeout = setTimeout(() => { tick(); const interval = setInterval(tick, 60 * 60 * 1000); cleanup.interval = interval; }, Math.max(1000, next.getTime() - now.getTime()));
	const cleanup: { interval?: ReturnType<typeof setInterval> } = {};
	return () => { stopped = true; clearTimeout(timeout); if (cleanup.interval) clearInterval(cleanup.interval); };
}
