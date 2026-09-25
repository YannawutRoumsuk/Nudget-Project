import { describe, expect, it } from 'vitest';
import { parseNotificationCommand, isValidTimeZone } from '../src/lib/notification-settings';
import { isQuietHour, isInQuietHours, zonedClock } from '../src/lib/reminder-time';
import { isUserActivityRequest } from '../src/lib/activity';

describe('notification settings', () => {
	it('parses the compact LINE settings commands', () => {
		expect(parseNotificationCommand('ตั้งค่าเตือน')).toEqual({ type: 'show' });
		expect(parseNotificationCommand('ตั้งค่าเตือน ปิด')).toEqual({ type: 'enabled', enabled: false });
		expect(parseNotificationCommand('ตั้งค่าเตือน เวลา 20')).toEqual({ type: 'hour', hour: 20 });
		expect(parseNotificationCommand('ตั้งค่าเตือน เขตเวลา America/Indiana/Indianapolis')).toEqual({ type: 'timezone', timezone: 'America/Indiana/Indianapolis' });
		expect(parseNotificationCommand('ตั้งค่าเตือน เขตเวลา UTC')).toEqual({ type: 'timezone', timezone: 'UTC' });
		expect(parseNotificationCommand('เตือน 20')).toBeNull();
	});

	it('validates IANA time zones before storing them', () => {
		expect(isValidTimeZone('Asia/Bangkok')).toBe(true);
		expect(isValidTimeZone('Not/AZone')).toBe(false);
	});

	it('uses the selected zone and supports quiet hours across midnight', () => {
		const now = new Date('2026-09-25T12:00:00Z');
		expect(zonedClock(now, 'Asia/Tokyo').hour).toBe(21);
		expect(isInQuietHours(now, 'America/Los_Angeles', 22, 7)).toBe(true);
		expect(isQuietHour(23, 22, 7)).toBe(true);
		expect(isQuietHour(6, 22, 7)).toBe(true);
		expect(isQuietHour(7, 22, 7)).toBe(false);
		expect(isQuietHour(21, 9, 17)).toBe(false);
	});

	it('treats authenticated page visits as activity but ignores assets and probes', () => {
		expect(isUserActivityRequest('GET', '/')).toBe(true);
		expect(isUserActivityRequest('GET', '/transactions')).toBe(true);
		expect(isUserActivityRequest('POST', '/transactions')).toBe(true);
		expect(isUserActivityRequest('DELETE', '/transactions/3')).toBe(true);
		expect(isUserActivityRequest('GET', '/_app/immutable/app.js')).toBe(false);
		expect(isUserActivityRequest('GET', '/api/health')).toBe(false);
	});
});
