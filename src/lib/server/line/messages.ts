import { getCategory } from '$lib/categories';
import type { CategorySlice, Totals } from '$lib/server/db/queries';
import type { Transaction } from '$lib/server/db/schema';
import { formatThaiShortDate, formatThaiTime } from '$lib/utils/date';
import { formatNumber, toNumber } from '$lib/utils/money';

function categoryLine(categoryId: string): string {
	const category = getCategory(categoryId);
	return category ? `${category.icon} ${category.nameTh}` : `📦 ${categoryId}`;
}

export function confirmSaved(tx: Transaction, uncertain: boolean): string {
	const amount = toNumber(tx.amount);
	const sign = tx.kind === 'income' ? '+' : '-';
	const when = `${formatThaiShortDate(tx.occurredAt)} ${formatThaiTime(tx.occurredAt)} น.`;
	const lines = [
		tx.kind === 'income' ? '💚 บันทึกรายรับแล้ว' : '✅ บันทึกแล้ว',
		`${sign}${formatNumber(amount)} บาท`,
		`${categoryLine(tx.categoryId)}${tx.note ? ` · ${tx.note}` : ''}`,
		when
	];
	if (uncertain) lines.push('', 'ℹ️ เดาหมวดหมู่ให้เป็น "อื่นๆ" — พิมพ์ "ลบ" ถ้าไม่ถูก');
	return lines.join('\n');
}

export function summaryText(
	title: string,
	totals: Totals,
	slices: CategorySlice[],
	options: { days?: number } = {}
): string {
	if (totals.count === 0) return `${title}\n\nยังไม่มีรายการในช่วงนี้`;

	const lines = [title, ''];
	if (totals.income > 0) lines.push(`รายรับ  +${formatNumber(totals.income)} บาท`);
	lines.push(`รายจ่าย  -${formatNumber(totals.expense)} บาท`);
	lines.push(`คงเหลือ  ${totals.net >= 0 ? '+' : ''}${formatNumber(totals.net)} บาท`);

	if (options.days && options.days > 1 && totals.expense > 0) {
		const perDay = totals.expense / options.days;
		lines.push(`เฉลี่ย  ${formatNumber(Math.round(perDay))} บาท/วัน`);
	}

	const top = slices.slice(0, 5);
	if (top.length > 0) {
		lines.push('', 'จ่ายมากสุด');
		const max = top[0].total || 1;
		for (const slice of top) {
			const bar = '▰'.repeat(Math.max(1, Math.round((slice.total / max) * 8)));
			lines.push(`${categoryLine(slice.categoryId)}  ${formatNumber(slice.total)}`);
			lines.push(`  ${bar}`);
		}
	}

	return lines.join('\n');
}

export function undoText(tx: Transaction | null): string {
	if (!tx) return 'ไม่มีรายการให้ลบ';
	const sign = tx.kind === 'income' ? '+' : '-';
	return [
		'🗑 ลบรายการล่าสุดแล้ว',
		`${sign}${formatNumber(toNumber(tx.amount))} บาท`,
		`${categoryLine(tx.categoryId)}${tx.note ? ` · ${tx.note}` : ''}`
	].join('\n');
}

export function helpText(): string {
	return [
		'📒 วิธีใช้',
		'',
		'บันทึกรายจ่าย — พิมพ์ของกับราคา',
		'  ข้าวเที่ยง 60',
		'  กาแฟ 85 บาท',
		'  ค่าน้ำมัน 1,200',
		'',
		'บันทึกรายรับ — ขึ้นต้นด้วย + หรือ "รับ"',
		'  +เงินเดือน 30000',
		'  รับ ฟรีแลนซ์ 5k',
		'',
		'ย้อนหลัง — ใส่วันไว้ข้างหน้า',
		'  เมื่อวาน ข้าว 50',
		'  1/9 ค่าไฟ 800',
		'',
		'สลิปโอนเงิน — ส่งรูปมา แล้วตอบว่าเป็นค่าอะไร',
		'',
		'คำสั่ง',
		'  วันนี้ — สรุปวันนี้',
		'  เดือนนี้ — สรุปเดือนนี้',
		'  งบ — ดูเงินที่ยังใช้ได้ต่อวัน',
		'  บิล — ดูรายการที่ยังต้องจ่าย',
		'  ลบ — ลบรายการล่าสุด',
		'  ไอดี — ดู LINE userId ของคุณ'
	].join('\n');
}

/** Kept deliberately short: this is the first message after someone adds the bot. */
export function welcomeText(): string {
	return [
		'👋 ยินดีต้อนรับ Nudget',
		'',
		'เริ่มง่าย ๆ: พิมพ์ “ข้าว 60” เพื่อบันทึกรายจ่าย',
		'ส่งรูปสลิป แล้วตอบว่าเป็นค่าอะไรได้เลย',
		'',
		'ถ้ายังเข้าใช้ไม่ได้ พิมพ์ “ไอดี” แล้วส่งรหัสให้เจ้าของบอทเพื่อเปิดบัญชี'
	].join('\n');
}

export function unknownText(): string {
	return [
		'🤔 ไม่เข้าใจข้อความนี้',
		'',
		'ลองพิมพ์แบบนี้ดู',
		'  ข้าวเที่ยง 60',
		'  +เงินเดือน 30000',
		'',
		'พิมพ์ "ช่วย" เพื่อดูวิธีใช้ทั้งหมด'
	].join('\n');
}

export function notAllowedText(userId: string): string {
	return [
		'🔒 บอทนี้ตั้งค่าให้ใช้ได้เฉพาะเจ้าของ',
		'',
		'ถ้านี่คือบอทของคุณ ใส่ค่านี้ใน .env:',
		`LINE_ALLOWED_USER_ID=${userId}`
	].join('\n');
}
