import type { PendingSlip } from '$lib/server/db/schema';
import { claimPendingSlip, updatePendingSlip } from '$lib/server/db/slips';
import { getMessageContent, pushText } from '$lib/server/line/client';
import { formatThaiShortDate, formatThaiTime } from '$lib/utils/date';
import { formatNumber } from '$lib/utils/money';
import type { SlipOcrResult } from './slip';
import { readSlip } from './slip';

export async function processPendingSlip(id: number): Promise<boolean> {
	const pending = await claimPendingSlip(id);
	if (!pending) return false;
	await processClaimedSlip(pending);
	return true;
}

export async function processClaimedSlip(pending: PendingSlip): Promise<void> {
	try {
		const result = await readSlip(await getMessageContent(pending.messageId));
		const updated = await updatePendingSlip(pending.id, {
			status: 'ready',
			amount: result.amount?.toFixed(2) ?? null,
			occurredAt: result.occurredAt,
			recipient: result.recipient,
			reference: result.reference,
			ocrText: result.text
		});
		if (!stillOurs(updated, pending)) return;
		await pushText(pending.lineUserId, `${describe(result)}\n\nพิมพ์ว่าเป็นค่าอะไร เช่น “ค่าอาหาร” หรือแก้ยอดได้ เช่น “ค่าของ 350”`);
	} catch (error) {
		console.error('[ocr] slip failed:', error);
		const updated = await updatePendingSlip(pending.id, { status: 'failed' });
		if (!stillOurs(updated, pending)) return;
		await pushText(pending.lineUserId, 'อ่านสลิปนี้ไม่สำเร็จ ลองส่งรูปที่ชัดขึ้น หรือพิมพ์รายการตามปกติ เช่น “ค่าของ 350”');
	}
}

/**
 * A user who thinks the bot has hung sends a second slip, and that send deletes
 * this row and inserts a new one (issue #43). Only the row we claimed may speak:
 * a missing row, or a row under a different primary key, means this read was
 * superseded, so it dies quietly instead of pushing a second result message the
 * user cannot match to either image.
 */
function stillOurs(updated: PendingSlip | null, pending: PendingSlip): boolean {
	if (updated && updated.id === pending.id && updated.messageId === pending.messageId) return true;
	console.info(`[ocr] slip ${pending.id} was superseded, dropping its result`);
	return false;
}

/**
 * Two slips can still be answered out of order, so every result says which one
 * it belongs to — amount, recipient, when it was paid and the tail of the
 * reference number, all of which the user can see on the image they sent.
 */
function describe(result: SlipOcrResult): string {
	const amount = result.amount === null ? 'ยังอ่านยอดไม่ชัด' : `${formatNumber(result.amount)} บาท`;
	const details = [
		result.recipient ? `ผู้รับ: ${result.recipient}` : '',
		result.occurredAt ? `${formatThaiShortDate(result.occurredAt)} ${formatThaiTime(result.occurredAt)} น.` : '',
		result.reference ? `เลขอ้างอิง …${result.reference.slice(-4)}` : ''
	].filter(Boolean);
	return [`🧾 อ่านสลิปแล้ว: ${amount}`, ...details].join('\n');
}
