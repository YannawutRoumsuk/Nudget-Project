/**
 * All day-bucketing in this app is done in Bangkok time, not UTC — "เงินที่ใช้
 * วันนี้" has to mean the calendar day the user is living in.
 *
 * Thailand is a fixed UTC+07:00 with no DST, so a constant offset is exact here
 * and keeps the maths testable without pulling in a tz database.
 */
export const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface DateParts {
	year: number;
	month: number; // 1-12
	day: number;
	hour: number;
	minute: number;
}

export function bangkokParts(instant: Date): DateParts {
	const shifted = new Date(instant.getTime() + BANGKOK_OFFSET_MS);
	return {
		year: shifted.getUTCFullYear(),
		month: shifted.getUTCMonth() + 1,
		day: shifted.getUTCDate(),
		hour: shifted.getUTCHours(),
		minute: shifted.getUTCMinutes()
	};
}

/** Build the UTC instant for a wall-clock time in Bangkok. */
export function fromBangkok(
	year: number,
	month: number,
	day: number,
	hour = 0,
	minute = 0
): Date {
	return new Date(Date.UTC(year, month - 1, day, hour, minute) - BANGKOK_OFFSET_MS);
}

/** `YYYY-MM-DD` of the Bangkok calendar day containing `instant`. */
export function bangkokDayKey(instant: Date): string {
	const { year, month, day } = bangkokParts(instant);
	return `${year}-${pad(month)}-${pad(day)}`;
}

export function bangkokMonthKey(instant: Date): string {
	const { year, month } = bangkokParts(instant);
	return `${year}-${pad(month)}`;
}

export function daysInBangkokMonth(instant: Date): number {
	const { year, month } = bangkokParts(instant);
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function bangkokDayStart(instant: Date): Date {
	const { year, month, day } = bangkokParts(instant);
	return fromBangkok(year, month, day);
}

export function bangkokMonthStart(instant: Date): Date {
	const { year, month } = bangkokParts(instant);
	return fromBangkok(year, month, 1);
}

export function addDays(instant: Date, days: number): Date {
	return new Date(instant.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addMonths(instant: Date, months: number): Date {
	const { year, month, day, hour, minute } = bangkokParts(instant);
	const target = month - 1 + months;
	const y = year + Math.floor(target / 12);
	const m = ((target % 12) + 12) % 12;
	const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
	return fromBangkok(y, m + 1, Math.min(day, lastDay), hour, minute);
}

/** Inclusive list of `YYYY-MM-DD` keys covering [from, to). */
export function dayKeyRange(from: Date, to: Date): string[] {
	const keys: string[] = [];
	let cursor = bangkokDayStart(from);
	const end = bangkokDayStart(to);
	while (cursor <= end) {
		keys.push(bangkokDayKey(cursor));
		cursor = addDays(cursor, 1);
	}
	return keys;
}

const THAI_MONTHS_SHORT = [
	'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
	'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'
];

/** e.g. `1 ก.ย.` — used on axis labels and list rows. */
export function formatThaiShortDate(instant: Date): string {
	const { day, month } = bangkokParts(instant);
	return `${day} ${THAI_MONTHS_SHORT[month - 1]}`;
}

/** e.g. `กันยายน 2568` (Buddhist era, as Thai users expect). */
export function formatThaiMonthYear(instant: Date): string {
	const full = [
		'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
		'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
	];
	const { month, year } = bangkokParts(instant);
	return `${full[month - 1]} ${year + 543}`;
}

export function formatThaiTime(instant: Date): string {
	const { hour, minute } = bangkokParts(instant);
	return `${pad(hour)}:${pad(minute)}`;
}

function pad(n: number): string {
	return String(n).padStart(2, '0');
}
