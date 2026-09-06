import { fail, redirect } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	checkPassword,
	createSessionToken,
	sessionCookieOptions
} from '$lib/server/auth';
import { config } from '$lib/server/config';
import { ensureUser } from '$lib/server/db/users';
import { safeNext } from '$lib/server/redirect';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.authed) redirect(303, safeNext(url.searchParams.get('next')));
	const liffId = config.liff.id;
	const passwordLogin =
		Boolean(config.dashboard.password && config.dashboard.sessionSecret) &&
		config.line.allowedUserIds.length === 1;
	return {
		liffId,
		// LINE sends the browser back to this page, so the client finishes the
		// sign-in and needs to know where the person was originally headed.
		next: safeNext(url.searchParams.get('next')),
		passwordLogin,
		addFriendId: config.line.addFriendId,
		// Only nag about setup when there is genuinely no way to sign in at all.
		unconfigured: !liffId && !passwordLogin
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');

		if (!config.dashboard.sessionSecret) {
			return fail(503, { message: 'ยังไม่ได้ตั้งค่า SESSION_SECRET ใน .env' });
		}
		// A shared password cannot say *who* is signing in. Once more than one
		// account is allowed it stops being an identity, so LINE login is the
		// only way in and this path refuses rather than guessing an owner.
		if (config.line.allowedUserIds.length !== 1) {
			return fail(403, { message: 'บัญชีนี้มีผู้ใช้หลายคน — เข้าสู่ระบบด้วย LINE เท่านั้น' });
		}
		if (!checkPassword(password)) {
			return fail(401, { message: 'รหัสผ่านไม่ถูกต้อง' });
		}

		const owner = await ensureUser(config.line.allowedUserIds[0]);
		cookies.set(SESSION_COOKIE, createSessionToken(owner.lineUserId), {
			...sessionCookieOptions,
			secure: url.protocol === 'https:'
		});
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
