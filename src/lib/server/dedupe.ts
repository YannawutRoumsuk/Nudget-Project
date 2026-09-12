import { createHash } from 'node:crypto';

const TIME_BUCKET_MS = 5 * 60_000;

function digest(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizedText(value: string): string {
	const thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
	return value
		.normalize('NFKC')
		.replace(/[๐-๙]/gu, (digit) => String(thaiDigits.indexOf(digit)))
		.trim()
		.replace(/\s+/gu, ' ')
		.toLowerCase();
}

export interface TextTransactionFingerprintInput {
	kind: string;
	amount: number | string;
	categoryId: string;
	note?: string | null;
	paymentMethod?: string | null;
}

/** Groups equivalent parsed entries while allowing the same purchase later. */
export function textTransactionFingerprint(
	tx: TextTransactionFingerprintInput,
	eventTime: Date | string | number,
	occurrenceIndex = 0
): string {
	const timestamp = eventTime instanceof Date ? eventTime.getTime() : new Date(eventTime).getTime();
	const bucket = Number.isFinite(timestamp) ? Math.floor(timestamp / TIME_BUCKET_MS) : 0;
	const amount = Number(String(tx.amount).replace(/,/g, '')).toFixed(2);
	return digest([
		'text', tx.kind, amount, tx.categoryId,
		normalizedText(tx.note ?? ''), tx.paymentMethod ?? 'bank',
		String(bucket), String(occurrenceIndex)
	].join('\0'));
}

export interface SlipFingerprintResult {
	amount?: number | string | null;
	occurredAt?: Date | string | number | null;
	recipient?: string | null;
	reference?: string | null;
}

/** Prefer stable OCR fields; use the original image when OCR is too weak to identify a slip. */
export function slipFingerprint(result: SlipFingerprintResult | null | undefined, imageBytes: Uint8Array | ArrayBuffer): string {
	const amount = result?.amount == null ? '' : normalizedText(String(result.amount).replace(/,/g, ''));
	const date = result?.occurredAt == null ? '' : new Date(result.occurredAt).toISOString();
	const recipient = normalizedText(result?.recipient ?? '');
	const reference = normalizedText(result?.reference ?? '');
	if (reference || (amount && date && recipient)) {
		return digest(`slip\0${amount}\0${date}\0${recipient}\0${reference}`);
	}
	const bytes = imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes);
	return createHash('sha256').update(bytes).digest('hex');
}
