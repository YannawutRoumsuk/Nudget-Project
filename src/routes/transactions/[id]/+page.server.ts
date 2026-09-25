import { fail, redirect } from '@sveltejs/kit';
import { ALL_CATEGORIES } from '$lib/categories';
import { requireUserId } from '$lib/server/auth';
import { getTransaction, updateTransaction } from '$lib/server/db/queries';
import { getCreditCard, listCreditCards } from '$lib/server/db/credit-cards';
import { bangkokParts, fromBangkok } from '$lib/utils/date';
import type { PaymentMethod, TxKind } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const METHODS: PaymentMethod[] = ['bank', 'cash', 'credit_card', 'shopee_paylater', 'wallet'];

export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = requireUserId(locals);
	const [item, cards] = await Promise.all([getTransaction(Number(params.id), userId), listCreditCards(userId)]);
	if (!item) redirect(303, '/transactions');
	return { item, cards: cards.filter((card) => card.active) };
};

export const actions: Actions = {
	default: async ({ params, request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const kind = String(form.get('kind')) as TxKind;
		const amount = Number(form.get('amount'));
		const categoryId = String(form.get('categoryId'));
		const paymentMethod = String(form.get('paymentMethod')) as PaymentMethod;
		const rawCardId = String(form.get('creditCardId') ?? '');
		const creditCardId = rawCardId === '' ? null : Number(rawCardId);
		const note = String(form.get('note') ?? '').trim();
		const excludeFromBaseline = form.get('excludeFromBaseline') === 'on';
		const [year, month, day] = String(form.get('date')).split('-').map(Number);
		const [hour, minute] = String(form.get('time') || '12:00').split(':').map(Number);
		const category = ALL_CATEGORIES.find((item) => item.id === categoryId && item.kind === kind);
		const occurredAt = fromBangkok(year, month, day, hour, minute);
		const roundTrip = bangkokParts(occurredAt);
		const validDateTime = year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31 &&
			hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 &&
			roundTrip.year === year && roundTrip.month === month && roundTrip.day === day && roundTrip.hour === hour && roundTrip.minute === minute;
		const card = creditCardId === null || !Number.isInteger(creditCardId) ? null : await getCreditCard(creditCardId, userId);
		if (!['expense', 'income'].includes(kind) || !Number.isFinite(amount) || amount <= 0 || !category || !METHODS.includes(paymentMethod) || !validDateTime ||
			(rawCardId !== '' && (!card || !card.active)) || (paymentMethod !== 'credit_card' && creditCardId !== null)) {
			return fail(400, { message: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง' });
		}
		const updated = await updateTransaction(Number(params.id), userId, {
			kind, amount: amount.toFixed(2), categoryId, note,
			paymentMethod, creditCardId, occurredAt, excludeFromBaseline
		});
		if (!updated) return fail(404, { message: 'ไม่พบรายการนี้' });
		redirect(303, '/transactions');
	}
};
