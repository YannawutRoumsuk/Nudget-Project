import { FALLBACK_CATEGORY } from '$lib/categories';
import { analyzeBudget } from '$lib/budget';
import { billDueDate } from '$lib/bills';
import { config } from '$lib/server/config';
import { admit, isOwner } from '$lib/server/access';
import { listMembers } from '$lib/server/db/users';
import { createBill, getUnpaidBillTotal, listBills } from '$lib/server/db/bills';
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
import type { User } from '$lib/server/db/schema';
import { processPendingSlip } from '$lib/server/ocr/processor';
import { matchCommand, parseEntries, parseMessage } from '$lib/server/parser';
import type { BotCommand, InstallmentPlan, ParseOutcome } from '$lib/server/parser';
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
import { getDisplayName, pushText, replyText } from './client';
import {
	confirmSaved,
	confirmSavedMany,
	confirmInstallment,
	helpText,
	dashboardLinkText,
	joinedText,
	membersText,
	newMemberText,
	revokedText,
	setupText,
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
	postback?: { data: string };
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
	const userId = event.source?.userId ?? '';
	if (!event.replyToken) return;

	if (config.line.allowedUserIds.length === 0) {
		// Nobody owns the bot yet, so hand back the id needed to claim it.
		await replyText(event.replyToken, userId ? setupText(userId) : 'ไม่พบ userId ในข้อความนี้');
		return;
	}

	// Adding the bot is the signup: there is nothing to type and nothing to
	// paste, which is the whole point of doing it here.
	if (event.type === 'follow') {
		await gateOnMembership(event.replyToken, userId, welcomeText());
		return;
	}

	if (event.type !== 'message' || !event.message) return;
	const text = event.message.text ?? '';
	// Bootstrap identity without allowing access to the personal ledger.
	if (matchCommand(text) === 'whoami') {
		await replyText(event.replyToken, userId ? `LINE userId ของคุณคือ\n${userId}` : 'ไม่พบ userId ในข้อความนี้');
		return;
	}

	const user = await gateOnMembership(event.replyToken, userId);
	if (!user) return;
	// Answered outside the ledger transaction: it reads other people's rows, so
	// it has no business inside a per-user write, and it must not be deduped.
	if (matchCommand(text) === 'members') {
		await replyText(event.replyToken, await membersSummary(userId));
		return;
	}
	if (event.message.type === 'image') {
		await handleSlipImage(event, user);
		return;
	}
	if (event.message.type !== 'text') return;

	const eventId = event.webhookEventId ?? event.message.id;
	if (!eventId) throw new Error('LINE message has no event identifier');
	// Parse outside the transaction: an LLM request must not hold a DB connection.
	// Use the original send time so retries across midnight keep the intended day.
	const sentAt = event.timestamp === undefined ? new Date() : new Date(event.timestamp);
	const pending = await getPendingSlip(user.id);
	// A slip conversation is about one payment, so it never splits into a list.
	let outcomes: ParseOutcome[];
	if (pending) {
		let outcome = await parseMessage(text, sentAt);
		if (pending.status === 'ready' && outcome.type === 'unknown' && pending.amount) {
			outcome = await parseMessage(`${text} ${pending.amount}`, pending.occurredAt ?? sentAt);
		}
		outcomes = [outcome];
	} else {
		outcomes = await parseEntries(text, sentAt);
	}
	const response = await processEventOnce(eventId, (executor) =>
		respondTo(outcomes, text, user, executor, pending)
	);
	if (response === null) return;
	try {
		await replyText(event.replyToken, response);
	} catch (error) {
		// The ledger is committed; a failed confirmation must not repeat mutations.
		console.error('[line] confirmation failed:', error);
	}
}

/**
 * Answers a message from someone who may not be a member yet, returning the
 * ledger to use or null when the caller should stop.
 */
async function gateOnMembership(replyToken: string, userId: string, greeting?: string): Promise<User | null> {
	const admission = await admit(userId, () => getDisplayName(userId));
	if (admission.status === 'member') {
		// A returning member who re-adds the bot gets a greeting; mid-conversation
		// there is nothing to say, so the caller carries on with their message.
		if (greeting) await replyText(replyToken, greeting);
		return greeting ? null : admission.user;
	}
	if (admission.status === 'revoked') {
		await replyText(replyToken, revokedText());
		return null;
	}
	// A first message that also opens the account gets the welcome rather than
	// being silently swallowed as an expense.
	await sendQuietly(() => replyText(replyToken, joinedText()));
	await announceNewMember(admission.user);
	return null;
}

/**
 * Anyone who adds the bot gets an account, so the owners' protection is knowing
 * it happened. Telling them is best-effort — a failed push must not undo a
 * signup — and the member list on the dashboard is the durable record.
 */
async function announceNewMember(user: User): Promise<void> {
	for (const owner of config.line.allowedUserIds) {
		if (owner === user.lineUserId) continue;
		await sendQuietly(() => pushText(owner, newMemberText(user.displayName, user.lineUserId, user.createdAt)));
	}
}

/**
 * One unreachable recipient must not abort a loop of messages or fail the
 * webhook — LINE would retry the whole event and repeat the ones that worked.
 */
async function sendQuietly(send: () => Promise<unknown>): Promise<void> {
	try {
		await send();
	} catch (error) {
		console.error('[line] message failed:', error);
	}
}

async function membersSummary(userId: string): Promise<string> {
	if (!isOwner(userId)) return 'เฉพาะเจ้าของบอทเท่านั้นที่ดูรายชื่อสมาชิกได้';
	return membersText(await listMembers());
}

async function handleSlipImage(event: LineEvent, user: User): Promise<void> {
	const messageId = event.message?.id;
	if (!messageId || !event.replyToken) return;
	const eventId = event.webhookEventId ?? messageId;
	const claimed = await processEventOnce(eventId, async (executor) => {
		return replacePendingSlip({ userId: user.id, lineUserId: user.lineUserId, messageId, status: 'queued' }, executor);
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
	outcomes: ParseOutcome[],
	text: string,
	user: User,
	executor: DbExecutor,
	pending: Awaited<ReturnType<typeof getPendingSlip>> = null
): Promise<string> {
	if (pending && /^(?:ยกเลิก|cancel)$/i.test(text.trim())) {
		await deletePendingSlip(user.id, executor);
		return 'ยกเลิกสลิปแล้ว';
	}
	if (pending?.status === 'queued' || pending?.status === 'processing') return 'กำลังอ่านสลิปอยู่ รอข้อความผลลัพธ์สักครู่นะ';
	if (outcomes.length > 1) return saveBatch(outcomes, text, user, executor);

	const [outcome] = outcomes;
	if (outcome.type === 'command') return runCommand(outcome.command, user, executor);
	if (outcome.type === 'unknown') return unknownText();
	// A plan is money not spent yet, so it becomes upcoming bills rather than
	// entries in the ledger.
	if (outcome.type === 'installment') return saveInstallment(outcome.plan, user, executor);

	const { tx } = outcome;
	const saved = await insertTransaction({
		userId: user.id,
		kind: tx.kind,
		amount: tx.amount.toFixed(2),
		categoryId: tx.categoryId,
		note: tx.note,
		occurredAt: pending?.occurredAt ?? tx.occurredAt,
		paymentMethod: pending ? 'bank' : tx.paymentMethod,
		source: 'line',
		parsedBy: pending ? 'ocr' : tx.parsedBy,
		rawText: pending ? `${text}\n[OCR]\n${pending.ocrText}` : text,
		lineUserId: user.lineUserId
	}, executor);
	if (pending) await deletePendingSlip(user.id, executor);

	return confirmSaved(saved, saved.categoryId === FALLBACK_CATEGORY[saved.kind]);
}

/**
 * Each month of a plan becomes its own one-off bill, numbered in the order the
 * amounts were typed. Separate bills rather than one recurring bill because the
 * instalments differ in amount and each is paid off on its own.
 */
async function saveInstallment(plan: InstallmentPlan, user: User, executor: DbExecutor): Promise<string> {
	const saved = [];
	for (const bill of plan.bills) {
		saved.push(
			await createBill({
				userId: user.id,
				name: `${plan.name} ${bill.sequence}/${plan.bills.length}`,
				amount: bill.amount.toFixed(2),
				categoryId: plan.categoryId,
				paymentMethod: 'bank',
				recurrence: 'once',
				dueDate: bill.dueDate,
				active: true
			}, executor)
		);
	}
	return confirmInstallment(plan.name, saved);
}

/**
 * Every line of a list lands in the same database transaction, so a message is
 * never half-recorded. `rawText` keeps the line that produced each entry rather
 * than the whole message, which is what makes a later mis-parse diagnosable.
 */
async function saveBatch(
	outcomes: ParseOutcome[],
	text: string,
	user: User,
	executor: DbExecutor
): Promise<string> {
	const saved = [];
	const skipped: string[] = [];
	for (const outcome of outcomes) {
		if (outcome.type !== 'transaction') {
			skipped.push(outcome.type === 'unknown' ? outcome.text : text);
			continue;
		}
		const { tx } = outcome;
		saved.push(
			await insertTransaction({
				userId: user.id,
				kind: tx.kind,
				amount: tx.amount.toFixed(2),
				categoryId: tx.categoryId,
				note: tx.note,
				occurredAt: tx.occurredAt,
				paymentMethod: tx.paymentMethod,
				source: 'line',
				parsedBy: tx.parsedBy,
				rawText: tx.note ? `${tx.note} ${tx.amount}` : text,
				lineUserId: user.lineUserId
			}, executor)
		);
	}
	return confirmSavedMany(saved, skipped);
}

async function runCommand(command: BotCommand, user: User, executor: DbExecutor): Promise<string> {
	switch (command) {
		case 'help':
			return helpText();
		case 'whoami':
			return `LINE userId ของคุณคือ\n${user.lineUserId}`;
		case 'web':
			// The rich menu is a phone-only affordance; on iPad and desktop LINE
			// this is how someone reaches the dashboard at all.
			return dashboardLinkText(config.publicBaseUrl);
		case 'members':
			// Answered in handleEvent: it reads across users, so it must not run
			// inside this user's write transaction.
			throw new Error('members must be handled before the ledger transaction');
		case 'undo':
			return undoText(await deleteLatestTransaction(user.id, executor));
		case 'bills':
			return billsSummary(user.id);
		case 'budget':
			return budgetSummary(user.id, executor);
		case 'today':
			return dailySummary(user.id, executor);
		case 'month':
		case 'summary':
			return monthlySummary(user.id, executor);
	}
}

async function billsSummary(userId: number): Promise<string> {
	const now = new Date();
	const unpaid = (await listBills(userId, now)).filter((bill) => !bill.paid);
	if (unpaid.length === 0) return '🧾 บิลที่ต้องจ่าย\n\nเดือนนี้ไม่มีบิลค้างแล้ว';
	const lines = ['🧾 บิลที่ต้องจ่าย', ''];
	for (const bill of unpaid.slice(0, 10)) {
		const due = billDueDate(bill, now);
		lines.push(`• ${bill.name} ${formatNumber(bill.amount)} บาท${due ? ` · ${formatThaiShortDate(due)}` : ''}`);
	}
	lines.push('', `รวม ${formatNumber(unpaid.reduce((sum, bill) => sum + bill.amount, 0))} บาท`);
	return lines.join('\n');
}

async function budgetSummary(userId: number, executor: DbExecutor): Promise<string> {
	const now = new Date();
	const month = bangkokMonthKey(now);
	const plan = await getMonthlyPlan(userId, month);
	if (!plan || toNumber(plan.expectedIncome) <= 0) {
		return '📊 ยังไม่ได้ตั้งงบเดือนนี้\n\nเปิดหน้า “แผนเดือน” บนเว็บ แล้วกรอกเงินที่มี ค่าอาหาร และค่าเดินทางก่อน';
	}
	const from = bangkokMonthStart(now);
	const range = { from, to: addMonths(from, 1) };
	const [totals, slices, unpaidBills, creditCardSpent] = await Promise.all([
		getTotals(userId, range, executor), getByCategory(userId, range, 'expense', executor),
		getUnpaidBillTotal(userId, now), getPaymentMethodTotal(userId, range, 'credit_card', executor)
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

async function dailySummary(userId: number, executor: DbExecutor): Promise<string> {
	const now = new Date();
	const from = bangkokDayStart(now);
	const range = { from, to: addDays(from, 1) };
	const [totals, slices] = await Promise.all([
		getTotals(userId, range, executor),
		getByCategory(userId, range, 'expense', executor)
	]);
	return summaryText(`📅 สรุปวันที่ ${formatThaiShortDate(now)}`, totals, slices);
}

async function monthlySummary(userId: number, executor: DbExecutor): Promise<string> {
	const now = new Date();
	const from = bangkokMonthStart(now);
	const range = { from, to: addMonths(from, 1) };
	const [totals, slices] = await Promise.all([
		getTotals(userId, range, executor),
		getByCategory(userId, range, 'expense', executor)
	]);
	// Average over days elapsed, not days in the month — mid-month numbers
	// otherwise look artificially low.
	const days = bangkokParts(now).day;
	return summaryText(`🗓 สรุป${formatThaiMonthYear(now)}`, totals, slices, { days });
}
