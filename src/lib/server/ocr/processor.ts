import type { PendingSlip } from '$lib/server/db/schema';
import { claimPendingSlip, updatePendingSlip } from '$lib/server/db/slips';
import { FALLBACK_CATEGORY } from '$lib/categories';
import { slipFingerprint } from '$lib/server/dedupe';
import { matchCategory } from '$lib/server/parser/rules';
import { getMessageContent, pushQuickReplies, pushText } from '$lib/server/line/client';
import { slipReviewActions, slipReviewText } from '$lib/server/line/messages';
import { readSlip } from './slip';

export async function processPendingSlip(id: number): Promise<boolean> {
	const pending = await claimPendingSlip(id);
	if (!pending) return false;
	await processClaimedSlip(pending);
	return true;
}

export async function processClaimedSlip(pending: PendingSlip): Promise<void> {
	try {
		const image = await getMessageContent(pending.messageId);
		const result = await readSlip(image, pending.userId);
		const categoryId = matchCategory(`${result.recipient}\n${result.text}`, 'expense')?.id ?? FALLBACK_CATEGORY.expense;
		const updated = await updatePendingSlip(pending.id, {
			status: 'ready',
			amount: result.amount?.toFixed(2) ?? null,
			occurredAt: result.occurredAt,
			categoryId,
			paymentMethod: 'bank',
			note: result.recipient.trim() || 'สลิปโอนเงิน',
			recipient: result.recipient,
			reference: result.reference,
			ocrText: result.text,
			ocrProvider: result.provider,
			amountConfidence: result.confidence.amount.toFixed(2),
			dateConfidence: result.confidence.date.toFixed(2),
			recipientConfidence: result.confidence.recipient.toFixed(2),
			fingerprint: slipFingerprint(result, image),
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
		});
		if (!stillOurs(updated, pending)) return;
		await pushQuickReplies(
			pending.lineUserId,
			slipReviewText(updated),
			slipReviewActions(updated.id)
		);
	} catch (error) {
		console.error('[ocr] slip failed:', error);
		const updated = await updatePendingSlip(pending.id, { status: 'failed' });
		if (!stillOurs(updated, pending)) return;
		await pushText(pending.lineUserId, 'อ่านสลิปนี้ไม่สำเร็จ ลองส่งรูปที่ชัดขึ้น หรือพิมพ์รายการตามปกติ เช่น “ค่าของ 350”');
	}
}

/**
 * A user who thinks the bot has hung sends a second slip, and that send
 * deletes this row and inserts a new one (issue #43). Only the row we claimed
 * may speak: a missing row, or a row under a different primary key, means this
 * read was superseded, so it dies quietly instead of pushing a second result
 * the user cannot match to either image.
 */
function stillOurs(updated: PendingSlip | null, pending: PendingSlip): updated is PendingSlip {
	if (updated && updated.id === pending.id && updated.messageId === pending.messageId) return true;
	console.info(`[ocr] slip ${pending.id} was superseded, dropping its result`);
	return false;
}
