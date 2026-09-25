import { billDueDate } from '$lib/bills';
import { bangkokDayStart, bangkokMonthStart, addDays, addMonths, bangkokDayKey, bangkokMonthKey, fromBangkok, bangkokParts } from '$lib/utils/date';
import { listBills } from './db/bills';
import { claimReminderDelivery, releaseReminderDelivery } from './db/queries';
import { listUsers } from './db/users';
import type { User } from './db/schema';
import { config } from './config';
import { pushText } from './line/client';
import { buildMonthlyLineSummary } from './monthly-summary';

export const INACTIVITY_REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function reminderKey(billId: number, dueDate: Date, daysBefore = config.reminders.daysBefore): string {
	return `${billId}:${bangkokDayKey(dueDate)}:${daysBefore}`;
}

export function shouldRemind(dueDate: Date, now: Date, daysBefore: number): boolean {
	const target = bangkokDayStart(addDays(dueDate, -daysBefore)).getTime();
	const today = bangkokDayStart(now).getTime();
	return today === target;
}

/**
 * Runs for every registered account. One person's LINE outage must not stop the
 * others' reminders, so a failed push is logged and the loop continues.
 */
export async function runReminderCheck(now = new Date()): Promise<void> {
	if (!config.line.accessToken) return;
	const users = await listUsers();
	const failures: unknown[] = [];
	for (const user of users) {
		try {
			await remindUser(user, now);
		} catch (error) {
			console.error(`[reminders] user ${user.id} failed:`, error);
			failures.push(error);
		}
	}
	if (failures.length > 0) throw failures[0];
}

async function remindUser(user: User, now: Date): Promise<void> {
	if (bangkokParts(now).hour === config.reminders.hour) {
		const bills = await listBills(user.id, now);
		const reminderOffsets = [...new Set([config.reminders.daysBefore, 0])];
		for (const bill of bills) {
			const dueDate = billDueDate(bill, now);
			if (bill.paid || !dueDate) continue;
			const reminderOffset = reminderOffsets.find((daysBefore) => shouldRemind(dueDate, now, daysBefore));
			if (reminderOffset === undefined) continue;
			const key = reminderKey(bill.id, dueDate, reminderOffset);
			if (!(await claimReminderDelivery(key, user.id))) continue;
			const { day, month, year } = bangkokParts(dueDate);
			const timing = reminderOffset === 0 ? 'ครบกำหนดวันนี้' : `ครบกำหนด ${day}/${month}/${year}`;
			try {
				const sent = await pushText(user.lineUserId, `🔔 เตือนบิล\n${bill.name} ${bill.amount.toLocaleString('th-TH')} บาท\n${timing}`);
				if (!sent) await releaseReminderDelivery(key);
			} catch (error) {
				await releaseReminderDelivery(key);
				throw error;
			}
		}
		if (bangkokParts(now).day === 1) await sendPreviousMonthSummary(user, now);
	}
	await sendInactivityReminder(user, now);
}

export function inactivityReminderKey(user: Pick<User, 'id' | 'lastActivityAt'>, now: Date): string | null {
	const lastActivity = user.lastActivityAt;
	if (!lastActivity || lastActivity.getTime() > now.getTime()) return null;
	const inactivePeriods = Math.floor((now.getTime() - lastActivity.getTime()) / INACTIVITY_REMINDER_INTERVAL_MS);
	if (inactivePeriods < 1) return null;
	return `inactive:${user.id}:${lastActivity.getTime()}:${inactivePeriods}`;
}

async function sendInactivityReminder(user: User, now: Date): Promise<void> {
	const key = inactivityReminderKey(user, now);
	if (!key || !(await claimReminderDelivery(key, user.id))) return;
	const inactivePeriods = Number(key.slice(key.lastIndexOf(':') + 1));
	const hours = inactivePeriods * 6;
	try {
		const sent = await pushText(user.lineUserId, `👋 ไม่ได้เปิด Nudget มา ${hours} ชั่วโมงแล้ว\nมีรายการหรือบิลที่อยากบันทึกไหม? ส่งข้อความเข้าแชทนี้ได้เลย`);
		if (!sent) await releaseReminderDelivery(key);
	} catch (error) {
		await releaseReminderDelivery(key);
		throw error;
	}
}

async function sendPreviousMonthSummary(user: User, now: Date): Promise<void> {
	const previousMonth = addMonths(bangkokMonthStart(now), -1);
	const month = bangkokMonthKey(previousMonth);
	const key = `monthly-summary:${user.id}:${month}`;
	if (!(await claimReminderDelivery(key, user.id))) return;
	try {
		// The monthly close is one automatic call per completed month, so it does
		// not spend one of the person's three manual analyses for today.
		const summary = await buildMonthlyLineSummary(user.id, month, now, { claimQuota: false });
		if (!summary.hasData || !(await pushText(user.lineUserId, summary.text))) {
			await releaseReminderDelivery(key);
		}
	} catch (error) {
		await releaseReminderDelivery(key);
		throw error;
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
