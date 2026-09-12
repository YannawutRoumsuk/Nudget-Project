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
