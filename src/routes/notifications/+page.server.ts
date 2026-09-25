import { fail, error } from '@sveltejs/kit';
import { isQuietHour } from '$lib/reminder-time';
import { isValidTimeZone } from '$lib/notification-settings';
import { requireUserId } from '$lib/server/auth';
import { getUserById, updateNotificationPreferences } from '$lib/server/db/users';
import type { Actions, PageServerLoad } from './$types';

function parseHour(value: FormDataEntryValue | null): number {
	const hour = Number(String(value ?? '').split(':')[0]);
	return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : -1;
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = await getUserById(requireUserId(locals));
	if (!user) error(404, 'ไม่พบบัญชี');
	return { preferences: {
		notificationsEnabled: user.notificationsEnabled,
		notificationHour: user.notificationHour,
		timezone: user.timezone,
		quietHoursStart: user.quietHoursStart,
		quietHoursEnd: user.quietHoursEnd
	} };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const notificationHour = parseHour(form.get('notificationHour'));
		const quietHoursStart = parseHour(form.get('quietHoursStart'));
		const quietHoursEnd = parseHour(form.get('quietHoursEnd'));
		const timezone = String(form.get('timezone') ?? '').trim();
		if (notificationHour < 0 || quietHoursStart < 0 || quietHoursEnd < 0 || quietHoursStart === quietHoursEnd || !isValidTimeZone(timezone)) {
			return fail(400, { message: 'ตรวจเวลา ช่วงงดรบกวน และเขตเวลาอีกครั้ง' });
		}
		if (isQuietHour(notificationHour, quietHoursStart, quietHoursEnd)) {
			return fail(400, { message: 'เวลาเตือนสรุปต้องอยู่นอกช่วงงดรบกวน' });
		}
		await updateNotificationPreferences(userId, {
			notificationsEnabled: form.get('notificationsEnabled') === 'on',
			notificationHour,
			timezone,
			quietHoursStart,
			quietHoursEnd
		});
		return { message: 'บันทึกการตั้งค่าแจ้งเตือนแล้ว' };
	}
};
