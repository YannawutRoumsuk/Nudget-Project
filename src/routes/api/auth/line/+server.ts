import { error, json } from '@sveltejs/kit';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '$lib/server/auth';
import { config } from '$lib/server/config';
import { resolveMember } from '$lib/server/access';
import { setDisplayName } from '$lib/server/db/users';
import type { RequestHandler } from './$types';

/** Exchanges a LIFF access token for a signed, httpOnly Nudget session. */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	if (!config.liff.id) error(503, 'LIFF ยังไม่ได้ตั้งค่า');
	const { accessToken } = await request.json().catch(() => ({}));
	if (typeof accessToken !== 'string' || accessToken.length < 16) error(400, 'access token ไม่ถูกต้อง');
	const response = await fetch('https://api.line.me/v2/profile', { headers: { authorization: `Bearer ${accessToken}` } });
	if (!response.ok) error(401, 'ยืนยันตัวตน LINE ไม่สำเร็จ');
	const profile = await response.json() as { userId?: string; displayName?: string };
	if (!profile.userId) error(401, 'LINE ไม่ส่ง user ID กลับมา');
	// Signing in does not create an account. Someone who has not been admitted
	// in LINE is sent there, so admission happens in exactly one place.
	const user = await resolveMember(profile.userId);
	if (!user) {
		error(403, 'บัญชีนี้ยังไม่ได้รับสิทธิ์ — แอด Nudget ใน LINE แล้วทักไปหนึ่งข้อความก่อน');
	}
	if (profile.displayName && profile.displayName !== user.displayName) {
		await setDisplayName(user.id, profile.displayName);
	}
	cookies.set(SESSION_COOKIE, createSessionToken(user.lineUserId), {
		...sessionCookieOptions,
		secure: url.protocol === 'https:'
	});
	return json({ ok: true });
};
