import { fail, redirect } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	checkPassword,
	createSessionToken,
	sessionCookieOptions
} from '$lib/server/auth';
import { config } from '$lib/server/config';
import { safeNext } from '$lib/server/redirect';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.authed) redirect(303, safeNext(url.searchParams.get('next')));
	return {
		configured: Boolean(config.dashboard.password && config.dashboard.sessionSecret),
		liffId: config.liff.id
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');

		if (!config.dashboard.sessionSecret) {
			return fail(503, { message: 'ยังไม่ได้ตั้งค่า SESSION_SECRET ใน .env' });
		}
		if (!checkPassword(password)) {
			return fail(401, { message: 'รหัสผ่านไม่ถูกต้อง' });
		}

		cookies.set(SESSION_COOKIE, createSessionToken(config.line.allowedUserId), {
			...sessionCookieOptions,
			secure: url.protocol === 'https:'
		});
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
