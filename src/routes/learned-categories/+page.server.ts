import { fail, redirect } from '@sveltejs/kit';
import { ALL_CATEGORIES } from '$lib/categories';
import { extractLearningKeyword, normalizeLearnedText } from '$lib/learned-categories';
import { requireUserId } from '$lib/server/auth';
import { deleteLearnedCategory, listLearnedCategories, updateLearnedCategory } from '$lib/server/db/learned-categories';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = requireUserId(locals);
	return { rules: await listLearnedCategories(userId), categories: ALL_CATEGORIES };
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const keyword = normalizeLearnedText(String(form.get('keyword') ?? ''));
		const categoryId = String(form.get('categoryId') ?? '');
		if (!Number.isInteger(id) || id <= 0 || Array.from(keyword).length < 3 || Array.from(keyword).length > 64 || !extractLearningKeyword(keyword) || !ALL_CATEGORIES.some((category) => category.id === categoryId)) {
			return fail(400, { message: 'คำต้องมีอย่างน้อย 3 ตัวอักษร และเลือกหมวดที่มีอยู่' });
		}
		try {
			if (!await updateLearnedCategory(userId, id, keyword, categoryId)) return fail(404, { message: 'ไม่พบกฎนี้' });
		} catch {
			return fail(409, { message: 'มีคำนี้อยู่แล้ว ลบกฎเดิมหรือเปลี่ยนคำก่อน' });
		}
		redirect(303, '/learned-categories');
	},
	delete: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || id <= 0 || !await deleteLearnedCategory(userId, id)) return fail(404, { message: 'ไม่พบกฎนี้' });
		redirect(303, '/learned-categories');
	}
};
