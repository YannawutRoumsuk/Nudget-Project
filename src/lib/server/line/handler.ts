import { FALLBACK_CATEGORY } from '$lib/categories';
import { analyzeBudget } from '$lib/budget';
import { billDueDate } from '$lib/bills';
import { config } from '$lib/server/config';
import { getUnpaidBillTotal, listBills } from '$lib/server/db/bills';
import { getMonthlyPlan } from '$lib/server/db/plans';
import {
	processEventOnce,
	deleteLatestTransaction,
	getByCategory,
	getPaymentMethodTotal,
	getTotals,
	insertTransaction
} from '$lib/server/db/queries';
import type { DbExecutor } from '$lib/server/db/queries';
import { deletePendingSlip, getPendingSlip, replacePendingSlip } from '$lib/server/db/slips';
import { processPendingSlip } from '$lib/server/ocr/processor';
import { matchCommand, parseMessage } from '$lib/server/parser';
import type { BotCommand, ParseOutcome } from '$lib/server/parser';
import {
	addDays,
	addMonths,
	bangkokDayStart,
	bangkokMonthStart,
	bangkokParts,
	formatThaiMonthYear,
	formatThaiShortDate,
	bangkokMonthKey,
	daysInBangkokMonth
} from '$lib/utils/date';
import { formatNumber, toNumber } from '$lib/utils/money';
import { replyText } from './client';
import {
	confirmSaved,
	helpText,
	notAllowedText,
	summaryText,
	undoText,
	unknownText,
	welcomeText
} from './messages';

export interface LineEvent {
	type: string;
	replyToken?: string;
	webhookEventId?: string;
	timestamp?: number;
	source?: { type: string; userId?: string };
	message?: { id: string; type: string; text?: string; contentProvider?: { type: string } };
}

export async function handleEvents(events: LineEvent[]): Promise<void> {
	// Sequential on purpose: entries from one person should land in the order
	// they were typed, and the volume here is a handful of events at most.
	for (const event of events) {
		// Stop on storage failure so later commands cannot overtake this entry.
		await handleEvent(event);
	}
}

async function handleEvent(event: LineEvent): Promise<void> {
	if (!event.replyToken) return;

	if (event.type === 'follow') {
		await replyText(event.replyToken, welcomeText());
		return;
	}

	const userId = event.source?.userId ?? '';
	if (event.type !== 'message' || !event.message) return;
	const text = event.message.text ?? '';
	// Bootstrap identity without allowing access to the personal ledger.
	if (matchCommand(text) === 'whoami') {
		await replyText(event.replyToken, userId ? `LINE userId ของคุณคือ\n${userId}` : 'ไม่พบ userId ในข้อความนี้');
		return;
	}
	if (!config.line.allowedUserId) {
		await replyText(event.replyToken, 'ยังไม่ได้ตั้งค่าเจ้าของบัญชี — พิมพ์ ไอดี แล้วนำค่าไปใส่ LINE_ALLOWED_USER_ID ใน .env');
		return;
	}
	if (userId !== config.line.allowedUserId) {
		await replyText(event.replyToken, notAllowedText(userId));
		return;
	}
	if (event.message.type === 'image') {
		await handleSlipImage(event, userId);
		return;
	}
	if (event.message.type !== 'text') return;

	const eventId = event.webhookEventId ?? event.message.id;
	if (!eventId) throw new Error('LINE message has no event identifier');
	// Parse outside the transaction: an LLM request must not hold a DB connection.
	// Use the original send time so retries across midnight keep the intended day.
	const sentAt = event.timestamp === undefined ? new Date() : new Date(event.timestamp);
	const pending = await getPendingSlip(userId);
	let outcome = await parseMessage(text, sentAt);
	if (pending?.status === 'ready' && outcome.type === 'unknown' && pending.amount) {
		outcome = await parseMessage(`${text} ${pending.amount}`, pending.occurredAt ?? sentAt);
	}
	const response = await processEventOnce(eventId, (executor) =>
		respondTo(outcome, text, userId, executor, pending)
	);
	if (response === null) return;
	try {
		await replyText(event.replyToken, response);
	} catch (error) {
		// The ledger is committed; a failed confirmation must not repeat mutations.
		console.error('[line] confirmation failed:', error);
	}
}

async function handleSlipImage(event: LineEvent, userId: string): Promise<void> {
	const messageId = event.message?.id;
	if (!messageId || !event.replyToken) return;
	const eventId = event.webhookEventId ?? messageId;
	const claimed = await processEventOnce(eventId, async (executor) => {
		return replacePendingSlip({ lineUserId: userId, messageId, status: 'queued' }, executor);
	});
	if (!claimed) return;
	if (config.ocr.mode === 'inline') void processPendingSlip(claimed.id);
	try {
		await replyText(event.replyToken, '🧾 รับสลิปแล้ว กำลังอ่านยอดและวันที่ให้นะ');
	} catch (error) {
		console.error('[line] slip acknowledgement failed:', error);
	}
}

async function respondTo(
	outcome: ParseOutcome,
	text: string,
	userId: string,
	executor: DbExecutor,
	pending: Awaited<ReturnType<typeof getPendingSlip>> = null
): Promise<string> {
	if (pending && /^(?:ยกเลิก|cancel)$/i.test(text.trim())) {
		await deletePendingSlip(userId, executor);
		return 'ยกเลิกสลิปแล้ว';
	}
	if (pending?.status === 'queued' || pending?.status === 'processing') return 'กำลังอ่านสลิปอยู่ รอข้อความผลลัพธ์สักครู่นะ';
	if (outcome.type === 'command') return runCommand(outcome.command, userId, executor);
	if (outcome.type === 'unknown') return unknownText();

	const { tx } = outcome;
	const saved = await insertTransaction({
		kind: tx.kind,
		amount: tx.amount.toFixed(2),
		categoryId: tx.categoryId,
		note: tx.note,
		occurredAt: pending?.occurredAt ?? tx.occurredAt,
		paymentMethod: pending ? 'bank' : tx.paymentMethod,
		source: 'line',
		parsedBy: pending ? 'ocr' : tx.parsedBy,
		rawText: pending ? `${text}\n[OCR]\n${pending.ocrText}` : text,
		lineUserId: userId || null
	}, executor);
	if (pending) await deletePendingSlip(userId, executor);

	return confirmSaved(saved, saved.categoryId === FALLBACK_CATEGORY[saved.kind]);
}

async function runCommand(command: BotCommand, userId: string, executor: DbExecutor): Promise<string> {
	switch (command) {
		case 'help':
			return helpText();
		case 'whoami':
			return userId ? `LINE userId ของคุณคือ\n${userId}` : 'ไม่พบ userId ในข้อความนี้';
		case 'undo':
			return undoText(await deleteLatestTransaction(executor));
		case 'bills':
			return billsSummary();
		case 'budget':
			return budgetSummary(executor);
		case 'today':
			return dailySummary(executor);
		case 'month':
		case 'summary':
			return monthlySummary(executor);
	}
}

async function billsSummary(): Promise<string> {
	const now = new Date();
	const unpaid = (await listBills(now)).filter((bill) => !bill.paid);
	if (unpaid.length === 0) return '🧾 บิลที่ต้องจ่าย\n\nเดือนนี้ไม่มีบิลค้างแล้ว';
	const lines = ['🧾 บิลที่ต้องจ่าย', ''];
	for (const bill of unpaid.slice(0, 10)) {
		const due = billDueDate(bill, now);
		lines.push(`• ${bill.name} ${formatNumber(bill.amount)} บาท${due ? ` · ${formatThaiShortDate(due)}` : ''}`);
	}
	lines.push('', `รวม ${formatNumber(unpaid.reduce((sum, bill) => sum + bill.amount, 0))} บาท`);
	return lines.join('\n');
}

async function budgetSummary(executor: DbExecutor): Promise<string> {
	const now = new Date();
	const month = bangkokMonthKey(now);
	const plan = await getMonthlyPlan(month);
	if (!plan || toNumber(plan.expectedIncome) <= 0) {
		return '📊 ยังไม่ได้ตั้งงบเดือนนี้\n\nเปิดหน้า “แผนเดือน” บนเว็บ แล้วกรอกเงินที่มี ค่าอาหาร และค่าเดินทางก่อน';
	}
	const from = bangkokMonthStart(now);
	const range = { from, to: addMonths(from, 1) };
	const [totals, slices, unpaidBills, creditCardSpent] = await Promise.all([
		getTotals(range, executor), getByCategory(range, 'expense', executor), getUnpaidBillTotal(now), getPaymentMethodTotal(range, 'credit_card', executor)
	]);
	const { day } = bangkokParts(now);
	const analysis = analyzeBudget({
		expectedIncome: toNumber(plan.expectedIncome), savingsGoal: toNumber(plan.savingsGoal),
		foodDailyBudget: toNumber(plan.foodDailyBudget), commuteDailyBudget: toNumber(plan.commuteDailyBudget),
		commuteDays: plan.commuteDays, expense: totals.expense,
		foodSpent: slices.find((item) => item.categoryId === 'food')?.total ?? 0,
		commuteSpent: slices.find((item) => item.categoryId === 'transport')?.total ?? 0,
		unpaidBills, currentDay: day, daysInMonth: daysInBangkokMonth(now)
	});
	const advice = analysis.status === 'over' ? '⛔ เกินงบแล้ว ควรหยุดรายจ่ายที่เลื่อนได้' : analysis.status === 'tight' ? '⚠️ งบเริ่มตึง ควรลดรายจ่ายที่ไม่จำเป็น' : '✅ ยังอยู่ในแผน';
	return [
		`📊 งบ${formatThaiMonthYear(now)}`, '', advice,
		`เหลือหลังหักบิล ${formatNumber(analysis.remaining)} บาท`,
		`ใช้ได้เฉลี่ย ${formatNumber(analysis.safeDaily)} บาท/วัน`,
		`ค่าอาหารยังใช้ได้ ${formatNumber(analysis.foodSafeDaily)} บาท/วัน`,
		`ค่าเดินทางยังใช้ได้ ${formatNumber(analysis.commuteSafeDaily)} บาท/วันทำงาน`,
		`ใช้บัตรเครดิตแล้ว ${formatNumber(creditCardSpent)} บาท`
	].join('\n');
}

async function dailySummary(executor: DbExecutor): Promise<string> {
	const now = new Date();
	const from = bangkokDayStart(now);
	const range = { from, to: addDays(from, 1) };
	const [totals, slices] = await Promise.all([
		getTotals(range, executor),
		getByCategory(range, 'expense', executor)
	]);
	return summaryText(`📅 สรุปวันที่ ${formatThaiShortDate(now)}`, totals, slices);
}

async function monthlySummary(executor: DbExecutor): Promise<string> {
	const now = new Date();
	const from = bangkokMonthStart(now);
	const range = { from, to: addMonths(from, 1) };
	const [totals, slices] = await Promise.all([
		getTotals(range, executor),
		getByCategory(range, 'expense', executor)
	]);
	// Average over days elapsed, not days in the month — mid-month numbers
	// otherwise look artificially low.
	const days = bangkokParts(now).day;
	return summaryText(`🗓 สรุป${formatThaiMonthYear(now)}`, totals, slices, { days });
}
