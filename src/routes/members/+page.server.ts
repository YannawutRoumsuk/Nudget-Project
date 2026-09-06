import { error, fail } from '@sveltejs/kit';
import { isOwner } from '$lib/server/access';
import { listMembers, setUserActive } from '$lib/server/db/users';
import type { Actions, PageServerLoad } from './$types';

/**
 * Seeing everyone's account — and being able to switch one off — is an owner
 * power, so this is the one page that reads outside the caller's own ledger.
 */
function requireOwner(locals: App.Locals): string {
	if (!locals.lineUserId || !isOwner(locals.lineUserId)) error(403, 'หน้านี้สำหรับเจ้าของบอทเท่านั้น');
	return locals.lineUserId;
}

export const load: PageServerLoad = async ({ locals }) => {
	const owner = requireOwner(locals);
	const members = await listMembers();
	return {
		members: members.map((member) => ({ ...member, isOwner: isOwner(member.lineUserId) })),
		ownerLineUserId: owner
	};
};

export const actions: Actions = {
	setActive: async ({ request, locals }) => {
		requireOwner(locals);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const active = form.get('active') === 'true';
		if (!Number.isInteger(id)) return fail(400, { message: 'id ไม่ถูกต้อง' });

		const updated = await setUserActive(id, active);
		if (!updated) return fail(404, { message: 'ไม่พบสมาชิกคนนี้' });
		// An owner is defined by LINE_ALLOWED_USER_ID, so switching their row off
		// would be undone on their next request. Say so instead of pretending.
		if (!active && isOwner(updated.lineUserId)) {
			return fail(409, { message: 'ต้องเอา id ออกจาก LINE_ALLOWED_USER_ID ก่อน จึงจะปิดสิทธิ์เจ้าของได้' });
		}
		return { message: active ? 'เปิดสิทธิ์แล้ว' : 'ปิดสิทธิ์แล้ว รายการเดิมยังอยู่ครบ' };
	}
};
