import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { config } from '$lib/server/config';
import { bangkokParts } from '$lib/utils/date';
import { readSlipWithGemini } from './gemini';

export interface SlipOcrResult {
	amount: number | null;
	occurredAt: Date | null;
	recipient: string;
	reference: string;
	text: string;
	/** Which host read the image. Recorded per slip, because that is the row
	 *  someone checks when they ask where a bank slip went. */
	provider: 'gemini' | 'openrouter' | 'tesseract';
	confidence: { amount: number; date: number; recipient: number };
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
	if (!workerPromise) {
		const cachePath = path.resolve('.cache/tesseract');
		workerPromise = mkdir(cachePath, { recursive: true }).then(() => createWorker(['tha', 'eng'], OEM.LSTM_ONLY, {
			cachePath,
			logger: (message) => {
				if (message.status === 'recognizing text' && message.progress === 1) return;
				console.info(`[ocr] ${message.status}${message.progress ? ` ${Math.round(message.progress * 100)}%` : ''}`);
			}
		})).then(async (worker) => {
			await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
			return worker;
		});
	}
	return workerPromise;
}

function numberFrom(value: string): number | null {
	const parsed = Number(value.replace(/,/g, '').replace(/\s/g, ''));
	return Number.isFinite(parsed) && parsed > 0 && parsed < 100_000_000 ? parsed : null;
}

export function parseSlipText(rawText: string): SlipOcrResult {
	const text = rawText.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
	const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
	const amountPatterns = [
		/(?:จำนวนเงิน|ยอดเงิน|ยอดโอน|amount|total)\s*[:：]?\s*(?:฿|thb)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
		/(?:฿|thb)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
		/([0-9][0-9,]*\.\d{2})\s*(?:บาท|thb)/i
	];
	let amount: number | null = null;
	for (const pattern of amountPatterns) {
		const match = text.match(pattern);
		amount = match ? numberFrom(match[1]) : null;
		if (amount !== null) break;
	}

	let occurredAt: Date | null = null;
	const numericDate = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
	const thaiDate = text.match(/\b(\d{1,2})\s+(ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/i);
	const dateParts = numericDate
		? { day: Number(numericDate[1]), month: Number(numericDate[2]), year: Number(numericDate[3]), hour: Number(numericDate[4] ?? 12), minute: Number(numericDate[5] ?? 0), thaiYear: false }
		: thaiDate
			? { day: Number(thaiDate[1]), month: thaiMonth(thaiDate[2]), year: Number(thaiDate[3]), hour: Number(thaiDate[4] ?? 12), minute: Number(thaiDate[5] ?? 0), thaiYear: true }
			: null;
	if (dateParts && dateParts.month !== null) {
		let year = dateParts.year;
		if (year < 100) year += dateParts.thaiYear ? 2500 : year > 70 ? 1900 : 2000;
		if (year > 2400) year -= 543;
		const { day, month, hour, minute } = dateParts;
		const candidate = new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
		const roundTrip = bangkokParts(candidate);
		if (!Number.isNaN(candidate.getTime()) && month >= 1 && month <= 12 && day >= 1 && day <= 31 &&
			hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 &&
			roundTrip.year === year && roundTrip.month === month && roundTrip.day === day && roundTrip.hour === hour && roundTrip.minute === minute) {
			occurredAt = candidate;
		}
	}

	const recipientIndex = lines.findIndex((line) => /(?:ไปยัง|ผู้รับ|ชื่อบัญชี|to\b)/i.test(line));
	const recipientOnLabel = recipientIndex >= 0
		? lines[recipientIndex].replace(/^.*?(?:ไปยัง|ผู้รับ|ชื่อบัญชี|to)\s*[:：]?\s*/i, '').trim()
		: '';
	const recipient = recipientOnLabel || (recipientIndex >= 0 ? lines[recipientIndex + 1] ?? '' : '');
	const referenceLine = lines.find((line) => /(?:เลขที่รายการ|รหัสรายการ|reference|ref\.?)/i.test(line));
	const reference = referenceLine?.replace(/^.*?(?:เลขที่รายการ|รหัสรายการ|reference|ref\.?)\s*[:：]?\s*/i, '').trim() ?? '';

	return {
		amount, occurredAt, recipient, reference, text, provider: 'tesseract',
		confidence: { amount: amount === null ? 0 : 0.8, date: occurredAt ? 0.75 : 0, recipient: recipient ? 0.65 : 0 }
	};
}

function thaiMonth(value: string): number | null {
	const key = value.toLowerCase().replace(/\./g, '');
	const months: Record<string, number> = {
		มค: 1, มกราคม: 1, กพ: 2, กุมภาพันธ์: 2, มีค: 3, มีนาคม: 3,
		เมย: 4, เมษายน: 4, พค: 5, พฤษภาคม: 5, มิย: 6, มิถุนายน: 6,
		กค: 7, กรกฎาคม: 7, สค: 8, สิงหาคม: 8, กย: 9, กันยายน: 9,
		ตค: 10, ตุลาคม: 10, พย: 11, พฤศจิกายน: 11, ธค: 12, ธันวาคม: 12
	};
	return months[key] ?? null;
}

/**
 * Reads a slip with whichever provider is configured. Gemini answers in about a
 * second where Tesseract needs five to twenty, which is what made a user think
 * the bot had hung and send a second slip (issue #43) — so it leads, and the
 * local reader stays as the fallback for when it is unavailable.
 */
export async function readSlip(image: ArrayBuffer | Uint8Array, userId?: number): Promise<SlipOcrResult> {
	const buffer = image instanceof Uint8Array ? Buffer.from(image) : Buffer.from(new Uint8Array(image));

	if (config.ocr.provider !== 'tesseract') {
		const viaGemini = await readSlipWithGemini(buffer, userId);
		if (viaGemini) return viaGemini;
		// A forced provider must not quietly cost the user twenty seconds in the
		// reader they opted out of; the caller turns this into a retry message.
		if (config.ocr.provider === 'gemini') throw new Error('Gemini slip OCR failed and OCR_PROVIDER=gemini forbids the Tesseract fallback');
		console.info('[ocr] Gemini unavailable, falling back to Tesseract');
	}

	return readSlipWithTesseract(buffer);
}

/** Local reader. Slow but offline, and the only path when no key is set. */
export async function readSlipWithTesseract(image: Buffer): Promise<SlipOcrResult> {
	const prepared = await sharp(image)
		.rotate()
		.resize({ width: 1800, withoutEnlargement: true })
		.grayscale()
		.normalize()
		.sharpen()
		.png()
		.toBuffer();
	const worker = await getWorker();
	const result = await worker.recognize(prepared);
	return parseSlipText(result.data.text);
}

export async function stopSlipOcr(): Promise<void> {
	if (!workerPromise) return;
	const worker = await workerPromise;
	workerPromise = null;
	await worker.terminate();
}
