import { fail, redirect } from '@sveltejs/kit';
import { EXPENSE_CATEGORIES } from '$lib/categories';
import { validateBillSchedule } from '$lib/bills';
import { createBill, listBills, markBillPaid, unmarkBillPaid, updateBill } from '$lib/server/db/bills';
import { fromBangkok } from '$lib/utils/date';
import type { BillRecurrence, PaymentMethod } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const METHODS: PaymentMethod[] = ['bank', 'cash', 'credit_card', 'wallet'];

function parseForm(form: FormData) {
	const name = String(form.get('name') ?? '').trim();
	const amount = Number(form.get('amount'));
	const categoryId = String(form.get('categoryId'));
	const paymentMethod = String(form.get('paymentMethod')) as PaymentMethod;
	const recurrence = String(form.get('recurrence')) as BillRecurrence;
	const dueDay = form.get('dueDay') ? Number(form.get('dueDay')) : null;
	const dueRaw = String(form.get('dueDate') ?? '');
	const [year, month, day] = dueRaw.split('-').map(Number);
	const dueDate = year && month && day ? fromBangkok(year, month, day, 9) : null;
	const active = form.get('active') === 'on' || form.get('active') === 'true';
	const valid = name && Number.isFinite(amount) && amount > 0 &&
		EXPENSE_CATEGORIES.some((item) => item.id === categoryId) && METHODS.includes(paymentMethod) &&
		['monthly', 'once'].includes(recurrence) && validateBillSchedule(recurrence, dueDay, dueDate);
	return { valid: Boolean(valid), values: { name, amount: amount.toFixed(2), categoryId, paymentMethod, recurrence,
		dueDay: recurrence === 'monthly' ? dueDay : null, dueDate: recurrence === 'once' ? dueDate : null, active } };
}

export const load: PageServerLoad = async () => ({ bills: await listBills(new Date(), true) });

export const actions: Actions = {
	create: async ({ request }) => {
		const parsed = parseForm(await request.formData());
		if (!parsed.valid) return fail(400, { message: 'กรอกชื่อ ยอด และวันจ่ายให้ครบ' });
		await createBill(parsed.values);
		redirect(303, '/bills');
	},
	update: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const parsed = parseForm(form);
		if (!Number.isInteger(id) || !parsed.valid) return fail(400, { message: 'ข้อมูลบิลไม่ถูกต้อง' });
		if (!await updateBill(id, parsed.values)) return fail(404, { message: 'ไม่พบบิลนี้' });
		redirect(303, '/bills');
	},
	paid: async ({ request }) => {
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || !await markBillPaid(id)) return fail(404, { message: 'ไม่พบบิลนี้' });
		redirect(303, '/bills');
	},
	unpaid: async ({ request }) => {
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || !await unmarkBillPaid(id)) return fail(404, { message: 'ไม่พบการจ่ายบิลนี้' });
		redirect(303, '/bills');
	}
};
