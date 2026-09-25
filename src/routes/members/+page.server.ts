import { error, fail } from '@sveltejs/kit';
import { isOwner } from '$lib/server/access';
import { listMembers, getUserById } from '$lib/server/db/users';
import { setMemberActive } from '$lib/server/db/admin';
import type { Actions, PageServerLoad } from './$types';

/**
 * Seeing everyone's account — and being able to switch one off — is an owner
 * power, so this is the one page that reads outside the caller's own ledger.
 */
function requireOwner(locals: App.Locals): { userId: number; lineUserId: string } {
	if (!locals.userId || !locals.lineUserId || !isOwner(locals.lineUserId)) error(403, 'หน้านี้สำหรับเจ้าของบอทเท่านั้น');
	return { userId: locals.userId, lineUserId: locals.lineUserId };
}

export const load: PageServerLoad = async ({ locals }) => {
	const actor = requireOwner(locals);
	const members = await listMembers();
	return {
		members: members.map((member) => ({ ...member, isOwner: isOwner(member.lineUserId) })),
		ownerLineUserId: actor.lineUserId
	};
};

export const actions: Actions = {
	setActive: async ({ request, locals }) => {
		const actor = requireOwner(locals);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const active = form.get('active') === 'true';
		if (!Number.isInteger(id)) return fail(400, { message: 'id ไม่ถูกต้อง' });

		const member = await getUserById(id);
		if (!member) return fail(404, { message: 'ไม่พบสมาชิกคนนี้' });
		if (!active && isOwner(member.lineUserId)) {
			return fail(409, { message: 'ต้องเอา id ออกจาก LINE_ALLOWED_USER_ID ก่อน จึงจะปิดสิทธิ์เจ้าของได้' });
		}
		const updated = await setMemberActive(actor, id, active);
		if (!updated) return fail(404, { message: 'ไม่พบสมาชิกคนนี้' });
		return { message: active ? 'เปิดสิทธิ์แล้ว' : 'ปิดสิทธิ์แล้ว รายการเดิมยังอยู่ครบ' };
	}
};
