import { error, fail } from '@sveltejs/kit';
import { isOwner } from '$lib/server/access';
import { requireUserId } from '$lib/server/auth';
import { config } from '$lib/server/config';
import { FEEDBACK_DAILY_LIMIT, FEEDBACK_MAX_LENGTH, countFeedbackByStatus, countFeedbackSince, createFeedback, listFeedback, setFeedbackStatus } from '$lib/server/db/feedback';
import { getUserByLineId } from '$lib/server/db/users';
import { pushText } from '$lib/server/line/client';
import { newFeedbackText } from '$lib/server/line/messages';
import type { FeedbackStatus } from '$lib/server/db/schema';
import { bangkokDayStart } from '$lib/utils/date';
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
	const owner = Boolean(locals.lineUserId && isOwner(locals.lineUserId));
	if (!owner) return { isOwner: false, feedback: [], counts: { new: 0, read: 0, done: 0 }, status: null };
	const status = parseStatus(url.searchParams.get('status'));
	const [feedback, counts] = await Promise.all([listFeedback({ status }), countFeedbackByStatus()]);
	return { isOwner: true, feedback, counts, status: status ?? null };
};

export const actions: Actions = {
	submit: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const lineUserId = locals.lineUserId ?? '';
		const form = await request.formData();
		const message = String(form.get('message') ?? '').trim();
		if (!message) return fail(400, { message: 'กรุณาพิมพ์ข้อความก่อนส่ง' });
		if (message.length > FEEDBACK_MAX_LENGTH) return fail(400, { message: `ข้อความยาวเกิน ${FEEDBACK_MAX_LENGTH} ตัวอักษร` });
		if (await countFeedbackSince(userId, bangkokDayStart(new Date())) >= FEEDBACK_DAILY_LIMIT) {
			return fail(429, { message: `วันนี้ส่งครบ ${FEEDBACK_DAILY_LIMIT} ครั้งแล้ว ลองใหม่พรุ่งนี้นะ` });
		}
		const user = await getUserByLineId(lineUserId);
		const saved = await createFeedback({ userId, lineUserId, displayName: user?.displayName ?? '', message });
		await Promise.allSettled(config.line.allowedUserIds.map((ownerId) =>
			pushText(ownerId, newFeedbackText(user?.displayName ?? '', message, saved.createdAt))
		));
		return { message: 'ส่งฟีดแบ็กแล้ว แอดมินได้รับการแจ้งเตือนทันที ขอบคุณครับ' };
	},
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
