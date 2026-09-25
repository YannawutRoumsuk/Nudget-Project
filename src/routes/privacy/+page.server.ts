import { fail, redirect } from '@sveltejs/kit';
import {
	createAccountDeletionChallenge,
	DELETE_CONFIRMATION_COOKIE,
	DELETE_CONFIRMATION_SECONDS,
	isRecentLineSession,
	requireUserId,
	SESSION_COOKIE,
	verifyAccountDeletionChallenge
} from '$lib/server/auth';
import { canDeleteAccount, deleteOwnAccount } from '$lib/server/db/privacy';
import type { Actions, PageServerLoad } from './$types';

function hasRecentLineSession(locals: App.Locals): boolean {
	if (locals.sessionIssuedAt === null || locals.sessionMethod === null) return false;
	return isRecentLineSession({ issuedAt: locals.sessionIssuedAt, method: locals.sessionMethod });
}

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const userId = requireUserId(locals);
	const lineUserId = locals.lineUserId ?? '';
	return {
		recentLineSession: hasRecentLineSession(locals),
		canDeleteAccount: await canDeleteAccount(lineUserId),
		deletionPrepared: verifyAccountDeletionChallenge(cookies.get(DELETE_CONFIRMATION_COOKIE), userId)
	};
};

export const actions: Actions = {
	prepareDeletion: async ({ locals, request, cookies, url }) => {
		const userId = requireUserId(locals);
		if (!hasRecentLineSession(locals)) return fail(403, { message: 'ต้องออกจากระบบแล้วเข้าสู่ระบบด้วย LINE ใหม่ก่อนลบบัญชี' });
		const form = await request.formData();
		if (form.get('exportAcknowledged') !== 'yes') return fail(400, { message: 'ยืนยันก่อนว่าดาวน์โหลดข้อมูลแล้ว หรือไม่ต้องการเก็บสำเนา' });
		if (!await canDeleteAccount(locals.lineUserId ?? '')) return fail(409, { message: 'ต้องโอนสิทธิ์ให้เจ้าของคนอื่น แล้วนำ LINE ID ของบัญชีนี้ออกจาก LINE_ALLOWED_USER_ID ก่อนจึงจะลบได้' });
		cookies.set(DELETE_CONFIRMATION_COOKIE, createAccountDeletionChallenge(userId), {
			path: '/', httpOnly: true, sameSite: 'strict', secure: url.protocol === 'https:', maxAge: DELETE_CONFIRMATION_SECONDS
		});
		return { prepared: true, message: 'ขั้นแรกเสร็จแล้ว อ่านคำเตือนและยืนยันการลบขั้นสุดท้ายด้านล่าง' };
	},
	cancelDeletion: async ({ cookies }) => {
		cookies.delete(DELETE_CONFIRMATION_COOKIE, { path: '/' });
		return { message: 'ยกเลิกคำขอลบบัญชีแล้ว' };
	},
	deleteAccount: async ({ locals, request, cookies }) => {
		const userId = requireUserId(locals);
		const lineUserId = locals.lineUserId ?? '';
		if (!hasRecentLineSession(locals)) return fail(403, { message: 'session LINE หมดช่วงยืนยัน โปรดเริ่มใหม่' });
		if (!verifyAccountDeletionChallenge(cookies.get(DELETE_CONFIRMATION_COOKIE), userId)) return fail(403, { message: 'ขั้นยืนยันหมดอายุแล้ว โปรดเริ่มคำขอใหม่' });
		const confirmation = String((await request.formData()).get('confirmation') ?? '').trim();
		if (confirmation !== 'ลบบัญชี') return fail(400, { message: 'พิมพ์ “ลบบัญชี” ให้ตรงเพื่อยืนยันขั้นสุดท้าย' });
		const result = await deleteOwnAccount(userId, lineUserId);
		if (result === 'owner_protected') return fail(409, { message: 'ต้องโอนสิทธิ์ให้เจ้าของคนอื่น แล้วนำ LINE ID ของบัญชีนี้ออกจาก LINE_ALLOWED_USER_ID ก่อนจึงจะลบได้' });
		if (result !== 'deleted') return fail(404, { message: 'ไม่พบบัญชีนี้แล้ว' });
		cookies.delete(SESSION_COOKIE, { path: '/' });
		cookies.delete(DELETE_CONFIRMATION_COOKIE, { path: '/' });
		redirect(303, '/login?accountDeleted=1');
	}
};
