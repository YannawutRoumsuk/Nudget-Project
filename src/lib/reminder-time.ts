export interface ZonedClock {
	year: number;
	month: number;
	day: number;
	hour: number;
}

/** Intl validates the timezone and returns its local calendar clock. */
export function zonedClock(date: Date, timeZone: string): ZonedClock {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
	}).formatToParts(date);
	const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
	return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour') };
}

export function isQuietHour(hour: number, start: number, end: number): boolean {
	if (start === end) return false;
	return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function isInQuietHours(date: Date, timeZone: string, start: number, end: number): boolean {
	return isQuietHour(zonedClock(date, timeZone).hour, start, end);
}
