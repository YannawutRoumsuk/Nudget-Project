import { fail } from '@sveltejs/kit';
import { EXPENSE_CATEGORIES } from '$lib/categories';
import { splitInstallments } from '$lib/credit-cards';
import { requireUserId } from '$lib/server/auth';
import { listBills } from '$lib/server/db/bills';
import {
	createCreditInstallmentPlan,
	getCreditCardCycleSpend,
	listCreditCards,
	listCreditInstallments,
	saveCreditCard,
	setCreditCardActive
} from '$lib/server/db/credit-cards';
import { bangkokParts, fromBangkok } from '$lib/utils/date';
import type { Actions, PageServerLoad } from './$types';

function validDay(value: FormDataEntryValue | null): number | null {
	const day = Number(value);
	return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function parseDate(value: FormDataEntryValue | null): Date | null {
	const [year, month, day] = String(value ?? '').split('-').map(Number);
	if (!year || !month || !day) return null;
	const result = fromBangkok(year, month, day, 9);
	const parts = bangkokParts(result);
	return parts.year === year && parts.month === month && parts.day === day ? result : null;
}

export const load: PageServerLoad = async ({ locals }) => {
	const userId = requireUserId(locals);
	const now = new Date();
	const [cards, bills, installments] = await Promise.all([
		listCreditCards(userId), listBills(userId, now), listCreditInstallments(userId)
	]);
	const cycleSpend = await Promise.all(cards.map((card) => getCreditCardCycleSpend(userId, card, now)));
	return { cards, bills, installments, cycleSpend: Object.fromEntries(cards.map((card, i) => [card.id, cycleSpend[i]])) };
};

export const actions: Actions = {
	saveCard: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const closingDay = validDay(form.get('closingDay'));
		const dueDay = validDay(form.get('dueDay'));
		const rawLimit = String(form.get('creditLimit') ?? '').trim();
		const creditLimit = rawLimit === '' ? null : Number(rawLimit);
		const id = form.get('id') ? Number(form.get('id')) : undefined;
		if (!name || name.length > 80 || closingDay === null || dueDay === null ||
			(creditLimit !== null && (!Number.isFinite(creditLimit) || creditLimit <= 0)) ||
			(id !== undefined && (!Number.isInteger(id) || id <= 0))) {
			return fail(400, { message: 'ตรวจชื่อบัตร วันตัดรอบ วันครบกำหนด และวงเงินอีกครั้ง' });
		}
		const saved = await saveCreditCard(userId, {
			name, closingDay, dueDay,
			creditLimit: creditLimit === null ? null : creditLimit.toFixed(2),
			isDefault: form.get('isDefault') === 'on'
		}, id);
		if (!saved) return fail(404, { message: 'ไม่พบบัตรนี้ในบัญชีของคุณ' });
		return { message: id ? 'บันทึกข้อมูลบัตรแล้ว' : 'เพิ่มบัตรแล้ว' };
	},
	deactivateCard: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || !await setCreditCardActive(id, userId, false)) return fail(404, { message: 'ไม่พบบัตรนี้' });
		return { message: 'ปิดบัตรแล้ว รายการและประวัติเดิมยังอยู่' };
	},
	createInstallment: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const creditCardId = Number(form.get('creditCardId'));
		const name = String(form.get('name') ?? '').trim();
		const categoryId = String(form.get('categoryId') ?? 'other');
		const totalAmount = Number(form.get('totalAmount'));
		const installmentCount = Number(form.get('installmentCount'));
		const purchaseDate = parseDate(form.get('purchaseDate'));
		const firstDueDate = parseDate(form.get('firstDueDate'));
		const amounts = splitInstallments(totalAmount, installmentCount);
		if (!Number.isInteger(creditCardId) || creditCardId <= 0 || !name || name.length > 120 ||
			!EXPENSE_CATEGORIES.some((category) => category.id === categoryId) || !purchaseDate || !firstDueDate ||
			firstDueDate < purchaseDate || amounts.length === 0) {
			return fail(400, { message: 'ตรวจรายละเอียด วันที่ ยอดรวม และจำนวนงวดอีกครั้ง (2–60 งวด)' });
		}
		const id = await createCreditInstallmentPlan({ userId, creditCardId, name, categoryId, totalAmount, purchaseDate, firstDueDate, installments: amounts });
		if (!id) return fail(400, { message: 'ไม่พบบัตรที่เปิดใช้งานในบัญชีของคุณ' });
		return { message: 'บันทึกยอดซื้อครั้งเดียวและสร้างตารางงวดแล้ว' };
	}
};
