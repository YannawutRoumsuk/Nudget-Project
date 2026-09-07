import { EXPENSE_CATEGORIES, FALLBACK_CATEGORY } from '$lib/categories';
import { analyzeBudget } from '$lib/budget';
import { billDueDate } from '$lib/bills';
import { config } from '$lib/server/config';
import { admit, isOwner } from '$lib/server/access';
import { listMembers } from '$lib/server/db/users';
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
import {
	consumePendingSlip,
	deleteOwnedPendingSlip,
	deletePendingSlip,
	getPendingSlip,
	replacePendingSlip,
	updateOwnedPendingSlip
} from '$lib/server/db/slips';
import type { PendingSlip, User } from '$lib/server/db/schema';
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
import { getDisplayName, pushText, replyQuickReplies, replyText } from './client';
import {
	confirmSaved,
	helpText,
	dashboardLinkText,
	joinedText,
	membersText,
	newMemberText,
	revokedText,
	setupText,
	slipReviewActions,
	slipReviewText,
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

	const text = event.type === 'message' ? event.message?.text ?? '' : '';
	// Bootstrap identity without allowing access to the personal ledger.
	if (event.type === 'message' && matchCommand(text) === 'whoami') {
		await replyText(event.replyToken, userId ? `LINE userId ของคุณคือ\n${userId}` : 'ไม่พบ userId ในข้อความนี้');
		return;
	}

	const user = await gateOnMembership(event.replyToken, userId);
	if (!user) return;
	if (event.type === 'postback' && event.postback) {
		await handleSlipPostback(event, user);
		return;
	}
	if (event.type !== 'message' || !event.message) return;
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
	// A ready slip already supplies the amount, so parse the user's description
	// once with that amount. This avoids spending an LLM fallback call on text
	// such as “ค่าอาหาร” that intentionally contains no number.
	const command = matchCommand(text);
	const outcome = pending?.status === 'ready' && pending.amount && !command
		? await parseMessage(`${text} ${pending.amount}`, pending.occurredAt ?? sentAt)
		: await parseMessage(text, sentAt);
	const response = await processEventOnce(eventId, (executor) =>
		respondTo(outcome, text, user, executor, pending)
	);
	if (response === null) return;
	try {
		await replyResponse(event.replyToken, response);
	} catch (error) {
		// The ledger is committed; a failed confirmation must not repeat mutations.
		console.error('[line] confirmation failed:', error);
	}
}

type LineResponse =
	| string
	| { kind: 'slip'; slip: PendingSlip }
	| { kind: 'categories'; pendingId: number };

async function replyResponse(replyToken: string, response: LineResponse): Promise<void> {
	if (typeof response === 'string') {
		await replyText(replyToken, response);
		return;
	}
	if (response.kind === 'categories') {
		await replyQuickReplies(replyToken, 'เลือกหมวดหมู่ของรายการนี้', EXPENSE_CATEGORIES.map((category) => ({
			label: `${category.icon} ${category.nameTh}`,
			data: `slip:category:${response.pendingId}:${category.id}`
		})));
		return;
	}
	await replyQuickReplies(replyToken, slipReviewText(response.slip), slipReviewActions(response.slip.id));
}

function pendingExpired(pending: PendingSlip): boolean {
	return Boolean(pending.expiresAt && pending.expiresAt.getTime() <= Date.now());
}

async function handleSlipPostback(event: LineEvent, user: User): Promise<void> {
	if (!event.replyToken) return;
	const data = event.postback?.data ?? '';
	const categoryMatch = /^slip:category:(\d+):([a-z_]{1,32})$/.exec(data);
	const actionMatch = /^slip:(save|edit-amount|change-category|change-date|cancel):(\d+)$/.exec(data);
	if (!categoryMatch && !actionMatch) return;
	const pendingId = Number(categoryMatch?.[1] ?? actionMatch?.[2]);
	if (!Number.isSafeInteger(pendingId) || pendingId <= 0) return;
	const eventId = event.webhookEventId;
	if (!eventId) throw new Error('LINE postback has no event identifier');

	const response = await processEventOnce(eventId, async (executor): Promise<LineResponse> => {
		const pending = await getPendingSlip(user.id, executor);
		if (!pending || pending.id !== pendingId) return 'รายการนี้ถูกบันทึก ยกเลิก หรือหมดเวลาแล้ว';
		if (pendingExpired(pending)) {
			await deleteOwnedPendingSlip(pending.id, user.id, executor);
			return 'สลิปนี้หมดเวลาแล้ว กรุณาส่งรูปใหม่อีกครั้ง';
		}

		if (categoryMatch) {
			const category = EXPENSE_CATEGORIES.find((item) => item.id === categoryMatch[2]);
			if (!category) return 'ไม่พบหมวดหมู่นี้';
			const updated = await updateOwnedPendingSlip(pending.id, user.id, { categoryId: category.id }, executor);
			return updated ? { kind: 'slip', slip: updated } : 'รายการนี้หมดเวลาแล้ว กรุณาส่งรูปใหม่อีกครั้ง';
		}

		switch (actionMatch![1]) {
			case 'edit-amount':
				return 'พิมพ์ยอดใหม่ เช่น “ยอด 350”';
			case 'change-date':
				return 'พิมพ์วันที่ใหม่ เช่น “วันที่ 7/9/2026”';
			case 'change-category':
				return { kind: 'categories', pendingId: pending.id };
			case 'cancel':
				await deleteOwnedPendingSlip(pending.id, user.id, executor);
				return 'ยกเลิกสลิปแล้ว';
			case 'save': {
				if (!pending.amount || toNumber(pending.amount) <= 0) return 'ยังไม่มียอดเงิน กด “แก้ยอด” ก่อนบันทึก';
				const claimed = await consumePendingSlip(pending.id, user.id, executor);
				if (!claimed) return 'รายการนี้ถูกบันทึก ยกเลิก หรือหมดเวลาแล้ว';
				const saved = await insertTransaction({
					userId: user.id,
					kind: 'expense',
					amount: claimed.amount!,
					categoryId: claimed.categoryId,
					note: claimed.note,
					occurredAt: claimed.occurredAt ?? new Date(),
					paymentMethod: claimed.paymentMethod,
					source: 'line',
					parsedBy: 'ocr',
					rawText: `[OCR]\n${claimed.ocrText}`,
					lineUserId: user.lineUserId
				}, executor);
				return confirmSaved(saved, saved.categoryId === FALLBACK_CATEGORY.expense);
			}
		}
		return 'ไม่รู้จักคำสั่งนี้';
	});
	if (response !== null) {
		try {
			await replyResponse(event.replyToken, response);
		} catch (error) {
			// Mutations are committed and deduped; failing the webhook here would
			// only make LINE retry an action whose side effect already succeeded.
			console.error('[line] postback response failed:', error);
		}
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
	outcome: ParseOutcome,
	text: string,
	user: User,
	executor: DbExecutor,
	pending: Awaited<ReturnType<typeof getPendingSlip>> = null
): Promise<LineResponse> {
	if (pending && pendingExpired(pending)) {
		await deleteOwnedPendingSlip(pending.id, user.id, executor);
		return 'สลิปก่อนหน้าหมดเวลาแล้ว กรุณาส่งรูปใหม่อีกครั้ง';
	}
	if (pending && /^(?:ยกเลิก|cancel)$/i.test(text.trim())) {
		await deletePendingSlip(user.id, executor);
		return 'ยกเลิกสลิปแล้ว';
	}
	if (pending?.status === 'queued' || pending?.status === 'processing') return 'กำลังอ่านสลิปอยู่ รอข้อความผลลัพธ์สักครู่นะ';
	if (outcome.type === 'command') return runCommand(outcome.command, user, executor);
	if (pending?.status === 'ready') {
		if (outcome.type === 'unknown') return 'บอกว่าเป็นค่าอะไร หรือกดปุ่มด้านล่างเพื่อแก้ไขและบันทึก';
		const trimmed = text.trim();
		let values: Parameters<typeof updateOwnedPendingSlip>[2];
		if (/^(?:ยอด|จำนวนเงิน?)\s*/i.test(trimmed)) {
			values = { amount: outcome.tx.amount.toFixed(2) };
		} else if (/^วันที่\s*/i.test(trimmed)) {
			values = { occurredAt: outcome.tx.occurredAt };
		} else {
			values = {
				amount: outcome.tx.amount.toFixed(2),
				categoryId: outcome.tx.categoryId,
				note: outcome.tx.note || pending.note
			};
		}
		const updated = await updateOwnedPendingSlip(pending.id, user.id, values, executor);
		return updated ? { kind: 'slip', slip: updated } : 'สลิปนี้หมดเวลาแล้ว กรุณาส่งรูปใหม่อีกครั้ง';
	}
	if (outcome.type === 'unknown') return unknownText();

	const { tx } = outcome;
	const saved = await insertTransaction({
		userId: user.id,
		kind: tx.kind,
		amount: tx.amount.toFixed(2),
		categoryId: tx.categoryId,
		note: tx.note,
		occurredAt: tx.occurredAt,
		paymentMethod: tx.paymentMethod,
		source: 'line',
		parsedBy: tx.parsedBy,
		rawText: text,
		lineUserId: user.lineUserId
	}, executor);
	return confirmSaved(saved, saved.categoryId === FALLBACK_CATEGORY[saved.kind]);
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
