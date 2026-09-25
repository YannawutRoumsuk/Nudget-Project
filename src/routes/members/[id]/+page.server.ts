import { error, fail } from '@sveltejs/kit';
import { ALL_CATEGORIES, EXPENSE_CATEGORIES } from '$lib/categories';
import { isOwner } from '$lib/server/access';
import { getUserById } from '$lib/server/db/users';
import { getAdminMemberDetail, deleteMemberBill, deleteMemberCategoryBudget, deleteMemberTransaction, saveMemberCategoryBudget, saveMemberNote, saveMemberPlan, setMemberActive, updateMemberBill, updateMemberTransaction } from '$lib/server/db/admin';
import { bangkokParts, fromBangkok } from '$lib/utils/date';
import type { Actions, PageServerLoad } from './$types';

type Actor = { userId: number; lineUserId: string };

function owner(locals: App.Locals): Actor {
	if (!locals.userId || !locals.lineUserId || !isOwner(locals.lineUserId)) error(403, 'หน้านี้สำหรับเจ้าของบอทเท่านั้น');
	return { userId: locals.userId, lineUserId: locals.lineUserId };
}

function targetId(raw: string): number {
	const id = Number(raw);
	if (!Number.isSafeInteger(id) || id < 1) error(404, 'ไม่พบสมาชิก');
	return id;
}

function positiveAmount(raw: FormDataEntryValue | null): string | null {
	const amount = Number(raw);
	return Number.isFinite(amount) && amount > 0 && amount <= 9_999_999_999.99 ? amount.toFixed(2) : null;
}

function nonNegativeAmount(raw: FormDataEntryValue | null): string | null {
	const amount = Number(raw);
	return Number.isFinite(amount) && amount >= 0 && amount <= 9_999_999_999.99 ? amount.toFixed(2) : null;
}

function localDateTime(raw: FormDataEntryValue | null): Date | null {
	const match = String(raw ?? '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
	if (!match) return null;
	const [, y, m, d, h, min] = match;
	const date = fromBangkok(Number(y), Number(m), Number(d), Number(h), Number(min));
	const parts = bangkokParts(date);
	return Number.isNaN(date.getTime()) || parts.year !== Number(y) || parts.month !== Number(m) || parts.day !== Number(d) || parts.hour !== Number(h) || parts.minute !== Number(min) ? null : date;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	owner(locals);
	const target = targetId(params.id);
	const detail = await getAdminMemberDetail(target);
	if (!detail) error(404, 'ไม่พบสมาชิก');
	return { ...detail, categories: ALL_CATEGORIES };
};

export const actions: Actions = {
	saveNote: async ({ locals, params, request }) => {
		const actor = owner(locals);
		const target = targetId(params.id);
		const note = String((await request.formData()).get('note') ?? '').trim();
		if (note.length > 2000) return fail(400, { message: 'หมายเหตุต้องไม่เกิน 2,000 ตัวอักษร' });
		if (!await saveMemberNote(actor, target, note)) return fail(404, { message: 'ไม่พบสมาชิก' });
		return { message: 'บันทึกหมายเหตุแล้ว' };
	},
	setActive: async ({ locals, params, request }) => {
		const actor = owner(locals);
		const target = targetId(params.id);
		const active = String((await request.formData()).get('active')) === 'true';
		const current = await getUserById(target);
		if (current && !active && isOwner(current.lineUserId)) return fail(409, { message: 'ต้องเอา LINE id ออกจาก LINE_ALLOWED_USER_ID ก่อนจึงจะถอนสิทธิ์เจ้าของได้' });
		const updated = await setMemberActive(actor, target, active);
		if (!updated) return fail(404, { message: 'ไม่พบสมาชิก' });
		return { message: active ? 'เปิดสิทธิ์แล้ว' : 'ปิดสิทธิ์แล้ว' };
	},
	updateTransaction: async ({ locals, params, request }) => {
		const actor = owner(locals);
		const target = targetId(params.id);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const kind = String(form.get('kind'));
		const categoryId = String(form.get('categoryId'));
		const amount = positiveAmount(form.get('amount'));
		const occurredAt = localDateTime(form.get('occurredAt'));
		const note = String(form.get('note') ?? '').trim();
		if (!Number.isSafeInteger(id) || id < 1) return fail(400, { message: 'รายการไม่ถูกต้อง' });
		if ((kind !== 'expense' && kind !== 'income') || !ALL_CATEGORIES.some((category) => category.id === categoryId && category.kind === kind)) return fail(400, { message: 'หมวดหรือประเภทรายการไม่ถูกต้อง' });
		if (!amount || !occurredAt || note.length > 500) return fail(400, { message: 'ตรวจยอดเงิน วันที่ และรายละเอียดอีกครั้ง' });
		const updated = await updateMemberTransaction(actor, target, id, {
			kind, amount, categoryId, note, occurredAt,
			...(kind === 'income' ? { paymentMethod: 'bank', creditCardId: null } : {})
		});
		if (!updated) return fail(404, { message: 'ไม่พบรายการของสมาชิกคนนี้' });
		return { message: 'แก้ไขรายการแล้ว' };
	},
	deleteTransaction: async ({ locals, params, request }) => {
		const actor = owner(locals);
		const target = targetId(params.id);
		const id = Number((await request.formData()).get('id'));
		if (!Number.isSafeInteger(id) || id < 1) return fail(400, { message: 'รายการไม่ถูกต้อง' });
		if (!await deleteMemberTransaction(actor, target, id)) return fail(404, { message: 'ไม่พบรายการของสมาชิกคนนี้' });
		return { message: 'ลบรายการแล้ว และบันทึกไว้ในประวัติผู้ดูแล' };
	},
	updateBill: async ({ locals, params, request }) => {
		const actor = owner(locals);
		const target = targetId(params.id);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const name = String(form.get('name') ?? '').trim();
		const amount = positiveAmount(form.get('amount'));
		const categoryId = String(form.get('categoryId') ?? '');
		const active = String(form.get('active')) === 'true';
		if (!Number.isSafeInteger(id) || id < 1) return fail(400, { message: 'บิลไม่ถูกต้อง' });
		if (!name || name.length > 120 || !amount || !EXPENSE_CATEGORIES.some((category) => category.id === categoryId)) return fail(400, { message: 'ตรวจชื่อ ยอด และหมวดของบิลอีกครั้ง' });
		if (!await updateMemberBill(actor, target, id, { name, amount, categoryId, active })) return fail(404, { message: 'ไม่พบบิลของสมาชิกคนนี้' });
		return { message: 'แก้ไขบิลแล้ว' };
	},
	deleteBill: async ({ locals, params, request }) => {
		const actor = owner(locals);
		const target = targetId(params.id);
		const id = Number((await request.formData()).get('id'));
		if (!Number.isSafeInteger(id) || id < 1) return fail(400, { message: 'บิลไม่ถูกต้อง' });
		if (!await deleteMemberBill(actor, target, id)) return fail(404, { message: 'ไม่พบบิลของสมาชิกคนนี้' });
		return { message: 'ลบบิลแล้ว และบันทึกไว้ในประวัติผู้ดูแล' };
	},
	savePlan: async ({ locals, params, request }) => {
		const actor = owner(locals);
		const target = targetId(params.id);
		const form = await request.formData();
		const month = String(form.get('month') ?? '');
		const expectedIncome = nonNegativeAmount(form.get('expectedIncome'));
		const savingsGoal = nonNegativeAmount(form.get('savingsGoal'));
		const foodDailyBudget = nonNegativeAmount(form.get('foodDailyBudget'));
		const commuteDailyBudget = nonNegativeAmount(form.get('commuteDailyBudget'));
		const commuteDays = Number(form.get('commuteDays'));
		if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !expectedIncome || !savingsGoal || !foodDailyBudget || !commuteDailyBudget || !Number.isInteger(commuteDays) || commuteDays < 0 || commuteDays > 31) {
			return fail(400, { message: 'ตรวจเดือนและยอดในแผนอีกครั้ง' });
		}
		await saveMemberPlan(actor, target, { month, expectedIncome, savingsGoal, foodDailyBudget, commuteDailyBudget, commuteDays, budgetAlertsEnabled: String(form.get('budgetAlertsEnabled')) === 'true' });
		return { message: 'บันทึกแผนรายเดือนแล้ว' };
	},
	saveCategoryBudget: async ({ locals, params, request }) => {
		const actor = owner(locals);
		const target = targetId(params.id);
		const form = await request.formData();
		const month = String(form.get('month') ?? '');
		const categoryId = String(form.get('categoryId') ?? '');
		const amount = positiveAmount(form.get('amount'));
		if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !amount || !EXPENSE_CATEGORIES.some((category) => category.id === categoryId)) return fail(400, { message: 'ตรวจเดือน หมวด และงบประมาณอีกครั้ง' });
		await saveMemberCategoryBudget(actor, target, { month, categoryId, amount });
		return { message: 'บันทึกงบหมวดหมู่แล้ว' };
	},
	deleteCategoryBudget: async ({ locals, params, request }) => {
		const actor = owner(locals);
		const target = targetId(params.id);
		const form = await request.formData();
		const month = String(form.get('month') ?? '');
		const categoryId = String(form.get('categoryId') ?? '');
		if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !EXPENSE_CATEGORIES.some((category) => category.id === categoryId)) return fail(400, { message: 'งบประมาณไม่ถูกต้อง' });
		if (!await deleteMemberCategoryBudget(actor, target, month, categoryId)) return fail(404, { message: 'ไม่พบงบหมวดนี้' });
		return { message: 'ลบงบหมวดหมู่แล้ว' };
	}
};
