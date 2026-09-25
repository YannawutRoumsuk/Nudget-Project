import { billDueDate } from '$lib/bills';
import { bangkokDayStart, addDays, addMonths, bangkokDayKey, bangkokMonthKey, fromBangkok, bangkokParts } from '$lib/utils/date';
import { isInQuietHours, zonedClock } from '$lib/reminder-time';
import { listBills } from './db/bills';
import { claimReminderDelivery, hasReminderDelivery, releaseReminderDelivery } from './db/queries';
import { listUsers } from './db/users';
import type { User } from './db/schema';
import { config } from './config';
import { pushText } from './line/client';
import { buildMonthlyLineSummary } from './monthly-summary';
import { sendBudgetThresholdAlerts } from './budget-alerts';
import { billReminderStage, buildBillReminderMessages, type BillReminderItem, type BillReminderStage } from './bill-reminder-message';
import { pushFlex } from './line/client';

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
	if (!user.notificationsEnabled) return;
	const local = zonedClock(now, user.timezone);
	const quiet = isInQuietHours(now, user.timezone, user.quietHoursStart, user.quietHoursEnd);
	if (!quiet && local.hour === user.notificationHour) {
		await sendBudgetThresholdAlerts(user.id, user.lineUserId, now);
		const bills = await listBills(user.id, now);
		const grouped: Record<BillReminderStage, Array<{ item: BillReminderItem; key: string }>> = { upcoming: [], due: [], overdue: [] };
		const today = bangkokDayKey(now);
		for (const bill of bills) {
			const dueDate = billDueDate(bill, now);
			if (bill.paid || !dueDate) continue;
			const daysUntilDue = Math.round((bangkokDayStart(dueDate).getTime() - bangkokDayStart(now).getTime()) / 86_400_000);
			const stage = billReminderStage(daysUntilDue, user.billReminderDaysBefore);
			if (!stage) continue;
			const snoozeKey = `bill-snooze:${bill.id}:${bill.period}:${today}`;
			if (await hasReminderDelivery(snoozeKey, user.id)) continue;
			const key = stage === 'overdue'
				? `bill:${bill.id}:${bill.period}:overdue:${today}`
				: reminderKey(bill.id, dueDate, stage === 'due' ? 0 : user.billReminderDaysBefore);
			grouped[stage].push({ item: { id: bill.id, name: bill.name, amount: bill.amount, period: bill.period, dueDate, stage }, key });
		}
		for (const stage of ['upcoming', 'due', 'overdue'] as const) {
			await sendBillReminderStage(user, grouped[stage]);
		}
		if (local.day === 1) {
			const previousMonth = bangkokMonthKey(addMonths(fromBangkok(local.year, local.month, 1), -1));
			await sendPreviousMonthSummary(user, previousMonth, now);
		}
	}
	if (!quiet) await sendInactivityReminder(user, now);
}

async function sendBillReminderStage(
	user: User,
	entries: Array<{ item: BillReminderItem; key: string }>
): Promise<void> {
	const claimed: typeof entries = [];
	for (const entry of entries) {
		if (await claimReminderDelivery(entry.key, user.id)) claimed.push(entry);
	}
	const messages = buildBillReminderMessages(claimed.map(({ item }) => item), config.publicBaseUrl ? `${config.publicBaseUrl}/bills` : '');
	for (let offset = 0; offset < messages.length; offset++) {
		const chunk = claimed.slice(offset * 12, (offset + 1) * 12);
		try {
			if (!await pushFlex(user.lineUserId, messages[offset].altText, messages[offset].contents)) {
				await Promise.all(chunk.map(({ key }) => releaseReminderDelivery(key)));
			}
		} catch (error) {
			await Promise.all(chunk.map(({ key }) => releaseReminderDelivery(key)));
			throw error;
		}
	}
}

export function inactivityReminderKey(user: Pick<User, 'id' | 'lastActivityAt'>, now: Date): string | null {
	const lastActivity = user.lastActivityAt;
	if (!lastActivity || lastActivity.getTime() > now.getTime()) return null;
	const inactivePeriods = Math.floor((now.getTime() - lastActivity.getTime()) / INACTIVITY_REMINDER_INTERVAL_MS);
	if (inactivePeriods < 1 || inactivePeriods >= 12) return null;
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

async function sendPreviousMonthSummary(user: User, month: string, now: Date): Promise<void> {
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
