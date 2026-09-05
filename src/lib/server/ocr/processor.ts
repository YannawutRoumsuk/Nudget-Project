import type { PendingSlip } from '$lib/server/db/schema';
import { claimPendingSlip, updatePendingSlip } from '$lib/server/db/slips';
import { getMessageContent, pushText } from '$lib/server/line/client';
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
		if (!updated || updated.messageId !== pending.messageId) return;
		const amount = result.amount ? `${result.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท` : 'ยังอ่านยอดไม่ชัด';
		const recipient = result.recipient ? `\nผู้รับ: ${result.recipient}` : '';
		await pushText(pending.lineUserId, `อ่านสลิปแล้ว: ${amount}${recipient}\n\nพิมพ์ว่าเป็นค่าอะไร เช่น “ค่าอาหาร” หรือแก้ยอดได้ เช่น “ค่าของ 350”`);
	} catch (error) {
		console.error('[ocr] slip failed:', error);
		const updated = await updatePendingSlip(pending.id, { status: 'failed' });
		if (!updated || updated.messageId !== pending.messageId) return;
		await pushText(pending.lineUserId, 'อ่านสลิปนี้ไม่สำเร็จ ลองส่งรูปที่ชัดขึ้น หรือพิมพ์รายการตามปกติ เช่น “ค่าของ 350”');
	}
}
