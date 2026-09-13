/**
 * Hand-written "what's new" copy, newest first. This is read from both the
 * server (the announce script) and anywhere client-side that wants to show a
 * changelog, so it must stay free of server-only imports.
 */
export interface ReleaseNote {
	version: string;
	date: Date;
	title: string;
	highlights: string[];
}

export const releases: ReleaseNote[] = [
	{
		version: '0.5.0',
		date: new Date('2026-09-13T00:00:00+07:00'),
		title: '📊 เห็นเงินใช้ชีวิตและภาระเดือนหน้าชัดขึ้น',
		highlights: [
			'แยกเงินใช้ชีวิตออกจากค่าเช่าและบิลในหน้าวิเคราะห์',
			'ดูค่าเฉลี่ยอาหาร เดินทาง และค่าใช้อื่นต่อวันได้',
			'ยอดบัตรเครดิตและ Shopee PayLater สร้างบิลเดือนหน้าอัตโนมัติ',
			'พิมพ์ “เดือนนี้” เพื่อรับสรุปพร้อมคำแนะนำจาก AI',
			'รับสรุปเดือนก่อนอัตโนมัติในวันที่ 1'
		]
	},
	{
		version: '0.4.0',
		date: new Date('2026-09-13T00:00:00+07:00'),
		title: '🤖 วิธีใช้ใหม่ ถามต่อกับ AI ได้แล้ว',
		highlights: [
			'พิมพ์ “วิธีใช้” แล้วเลือกหัวข้อจากปุ่มได้ทันที',
			'พิมพ์คำสั่งย่อยติดกันได้ เช่น “วิธีใช้สลิป”',
			'พิมพ์ “ช่วยเหลือ” เพื่อถามวิธีใช้กับ AI',
			'ส่งฟีดแบ็กถึงแอดมินได้จากหน้าเว็บ',
			'เพิ่ม Rich Menu ใหม่ 8 ช่องสำหรับฟีเจอร์ที่ใช้บ่อย'
		]
	},
	{
		version: '0.3.0',
		date: new Date('2026-09-12T00:00:00+07:00'),
		title: '📸 อ่านสลิปแม่นขึ้น จดละเอียดขึ้น',
		highlights: [
			'อ่านสลิปเร็วขึ้นและแม่นขึ้น',
			'ส่งสลิปซ้อนกันแล้วไม่สับสนอีก',
			'ใส่โน้ตรายละเอียดในรายการได้',
			'คู่มือวิธีใช้ที่บอกครบว่าทำอะไรได้บ้าง',
			'ส่งฟีดแบ็กหาผู้พัฒนาได้ในแชท'
		]
	},
	{
		version: '0.2.0',
		date: new Date('2026-09-07T00:00:00+07:00'),
		title: '🧾 บันทึกไวขึ้น ดูย้อนหลังได้',
		highlights: [
			'บันทึกหลายรายการในข้อความเดียว',
			'ตั้งบิลผ่อนหลายงวดจากข้อความเดียว',
			'ส่งออกข้อมูลส่วนตัวเป็น CSV และ JSON',
			'เลือกดูเดือนย้อนหลังได้'
		]
	}
];

/** Newest release, i.e. the one a fresh announce run should send. */
export function latestRelease(): ReleaseNote {
	return releases[0];
}

export function findRelease(version: string): ReleaseNote | undefined {
	return releases.find((release) => release.version === version);
}
