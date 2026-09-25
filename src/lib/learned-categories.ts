import type { TxKind } from '$lib/server/db/schema';

const STOP_WORDS = new Set([
	'ค่า', 'ค่ากิน', 'ค่าอาหาร', 'รายจ่าย', 'รายรับ', 'จ่าย', 'จ่ายเงิน', 'ซื้อ', 'ใช้', 'กิน', 'ข้าว', 'อาหาร',
	'กาแฟ', 'น้ำ', 'เดินทาง', 'รถ', 'ค่าเดินทาง', 'ค่าเช่า', 'บิล', 'เงินสด', 'บัตรเครดิต', 'บาท', 'เงินเดือน',
	'ร้าน', 'ของ', 'ที่', 'ไป', 'กับ', 'และ', 'สลิป', 'สลิปโอนเงิน', 'โอน', 'โอนเงิน', 'the', 'and', 'for', 'pay', 'payment', 'expense', 'income', 'food', 'other', 'shop'
]);

/** Store one specific word only; short/common phrases are too ambiguous to learn safely. */
export function extractLearningKeyword(note: string, rawText = ''): string | null {
	for (const source of [note, rawText]) {
		const cleaned = source.normalize('NFC').toLocaleLowerCase()
			.replace(/\b\d+(?:[,.]\d+)*(?:k|พัน|หมื่น|แสน|ล้าน)?\b/giu, ' ')
			.replace(/\d{1,4}[/-]\d{1,2}(?:[/-]\d{2,4})?/gu, ' ')
			.replace(/฿|บาท|thb|เครดิตการ์ด|บัตรเครดิต|credit\s*card|shopee\s*(?:paylater|later)|ช้อปปี้\s*(?:เพย์)?เล(?:เทอ|เตอ)ร์|เงินสด|โอนเงิน/giu, ' ')
			.replace(/[+\-]/gu, ' ');
		const candidates = cleaned.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
		for (const candidate of candidates) {
			const chars = Array.from(candidate);
			if (chars.length < 3 || chars.length > 40 || STOP_WORDS.has(candidate) || /^\d+$/u.test(candidate)) continue;
			return candidate;
		}
	}
	return null;
}

export function normalizeLearnedText(value: string): string {
	return value.normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

export function learnedKeywordMatches(keyword: string, text: string, kind: TxKind, categoryKind: TxKind): boolean {
	if (kind !== categoryKind) return false;
	const normalizedKeyword = normalizeLearnedText(keyword);
	const normalizedText = normalizeLearnedText(text);
	if (/[a-z0-9]/u.test(normalizedKeyword)) return ` ${normalizedText} `.includes(` ${normalizedKeyword} `);
	return normalizedText.includes(normalizedKeyword);
}
