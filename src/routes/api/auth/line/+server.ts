import { error, json } from '@sveltejs/kit';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '$lib/server/auth';
import { config } from '$lib/server/config';
import type { RequestHandler } from './$types';

/** Exchanges a LIFF access token for a signed, httpOnly Nudget session. */
export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!config.liff.id) error(503, 'LIFF ยังไม่ได้ตั้งค่า');
	const { accessToken } = await request.json().catch(() => ({}));
	if (typeof accessToken !== 'string' || accessToken.length < 16) error(400, 'access token ไม่ถูกต้อง');
	const response = await fetch('https://api.line.me/v2/profile', { headers: { authorization: `Bearer ${accessToken}` } });
	if (!response.ok) error(401, 'ยืนยันตัวตน LINE ไม่สำเร็จ');
	const profile = await response.json() as { userId?: string };
	if (!profile.userId) error(401, 'LINE ไม่ส่ง user ID กลับมา');
	// The existing dashboard is still a single-owner ledger. Do not create a
	// session for another LINE account until the tenant migration is deployed.
	if (!config.line.allowedUserId || profile.userId !== config.line.allowedUserId) {
		error(403, 'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้ dashboard');
	}
	cookies.set(SESSION_COOKIE, createSessionToken(profile.userId), sessionCookieOptions);
	return json({ ok: true });
};
