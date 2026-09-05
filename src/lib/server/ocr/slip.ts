import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { bangkokParts } from '$lib/utils/date';

export interface SlipOcrResult {
	amount: number | null;
	occurredAt: Date | null;
	recipient: string;
	reference: string;
	text: string;
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
	const dateMatch = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
	if (dateMatch) {
		let year = Number(dateMatch[3]);
		if (year < 100) year += year > 70 ? 1900 : 2000;
		if (year > 2400) year -= 543;
		const day = Number(dateMatch[1]);
		const month = Number(dateMatch[2]);
		const hour = Number(dateMatch[4] ?? 12);
		const minute = Number(dateMatch[5] ?? 0);
		const candidate = new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
		const roundTrip = bangkokParts(candidate);
		if (!Number.isNaN(candidate.getTime()) && month >= 1 && month <= 12 && day >= 1 && day <= 31 &&
			hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 &&
			roundTrip.year === year && roundTrip.month === month && roundTrip.day === day && roundTrip.hour === hour && roundTrip.minute === minute) {
			occurredAt = candidate;
		}
	}

	const recipientLine = lines.find((line) => /(?:ไปยัง|ผู้รับ|ชื่อบัญชี|to\b)/i.test(line));
	const recipient = recipientLine?.replace(/^.*?(?:ไปยัง|ผู้รับ|ชื่อบัญชี|to)\s*[:：]?\s*/i, '').trim() ?? '';
	const referenceLine = lines.find((line) => /(?:เลขที่รายการ|รหัสรายการ|reference|ref\.?)/i.test(line));
	const reference = referenceLine?.replace(/^.*?(?:เลขที่รายการ|รหัสรายการ|reference|ref\.?)\s*[:：]?\s*/i, '').trim() ?? '';

	return { amount, occurredAt, recipient, reference, text };
}

export async function readSlip(image: ArrayBuffer): Promise<SlipOcrResult> {
	const prepared = await sharp(Buffer.from(image))
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
