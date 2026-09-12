import { error, fail } from '@sveltejs/kit';
import { isOwner } from '$lib/server/access';
import { countFeedbackByStatus, listFeedback, setFeedbackStatus } from '$lib/server/db/feedback';
import type { FeedbackStatus } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const STATUSES: FeedbackStatus[] = ['new', 'read', 'done'];

/** Reading what members wrote in is an owner power, same gate as /members. */
function requireOwner(locals: App.Locals): void {
	if (!locals.lineUserId || !isOwner(locals.lineUserId)) error(403, 'หน้านี้สำหรับเจ้าของบอทเท่านั้น');
}

function parseStatus(value: string | null): FeedbackStatus | undefined {
	return value && STATUSES.includes(value as FeedbackStatus) ? (value as FeedbackStatus) : undefined;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	requireOwner(locals);
	const status = parseStatus(url.searchParams.get('status'));
	const [feedback, counts] = await Promise.all([listFeedback({ status }), countFeedbackByStatus()]);
	return { feedback, counts, status: status ?? null };
};

export const actions: Actions = {
	markStatus: async ({ request, locals }) => {
		requireOwner(locals);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const status = form.get('status');
		if (!Number.isInteger(id) || typeof status !== 'string' || !STATUSES.includes(status as FeedbackStatus)) {
			return fail(400, { message: 'ข้อมูลไม่ถูกต้อง' });
		}

		const updated = await setFeedbackStatus(id, status as FeedbackStatus);
		if (!updated) return fail(404, { message: 'ไม่พบความคิดเห็นนี้' });
		return { message: 'อัปเดตสถานะแล้ว' };
	}
};
