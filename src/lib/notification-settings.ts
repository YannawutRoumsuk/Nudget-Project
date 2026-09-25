export type NotificationCommand =
	| { type: 'show' }
	| { type: 'enabled'; enabled: boolean }
	| { type: 'hour'; hour: number }
	| { type: 'timezone'; timezone: string };

export function isValidTimeZone(timezone: string): boolean {
	if (!timezone || timezone.length > 64) return false;
	try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); return true; } catch { return false; }
}

export function parseNotificationCommand(text: string): NotificationCommand | null {
	const value = text.trim();
	if (value === 'ตั้งค่าเตือน') return { type: 'show' };
	if (value === 'ตั้งค่าเตือน เปิด') return { type: 'enabled', enabled: true };
	if (value === 'ตั้งค่าเตือน ปิด') return { type: 'enabled', enabled: false };
	const hour = /^ตั้งค่าเตือน เวลา (\d{1,2})$/.exec(value);
	if (hour) return { type: 'hour', hour: Number(hour[1]) };
	const timezone = /^ตั้งค่าเตือน เขตเวลา ([A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*)$/.exec(value);
	if (timezone) return { type: 'timezone', timezone: timezone[1] };
	return null;
}
