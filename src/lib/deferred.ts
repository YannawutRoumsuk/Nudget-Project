import { categoryLabel } from '$lib/categories';
import type { PaymentMethod, TxKind } from '$lib/server/db/schema';
import { addMonths } from '$lib/utils/date';
import { cardDueDate, type CreditCardSchedule } from '$lib/credit-cards';

export interface DeferredPurchase {
	id: number;
	userId: number;
	kind: TxKind;
	amount: string;
	categoryId: string;
	note: string;
	occurredAt: Date;
	paymentMethod: PaymentMethod;
	creditCardId?: number | null;
}

export interface DeferredBillDraft {
	userId: number;
	name: string;
	amount: string;
	categoryId: 'bills';
	paymentMethod: 'bank';
	recurrence: 'once';
	dueDay: null;
	dueDate: Date;
	sourceTransactionId: number;
	creditCardId: number | null;
	noExpenseOnPay: true;
	active: true;
}

/** One deferred purchase is paid next month but remains spending in its purchase month. */
export function deferredBillForTransaction(tx: DeferredPurchase, card?: CreditCardSchedule | null): DeferredBillDraft | null {
	if (tx.kind !== 'expense' || !['credit_card', 'shopee_paylater'].includes(tx.paymentMethod)) return null;
	const source = tx.paymentMethod === 'credit_card' ? 'บัตรเครดิต' : 'Shopee PayLater';
	const detail = tx.note.trim() || categoryLabel(tx.categoryId);
	const dueDate = tx.paymentMethod === 'credit_card' && card
		? cardDueDate(tx.occurredAt, card)
		: addMonths(tx.occurredAt, 1);
	return {
		userId: tx.userId,
		name: `${source}: ${detail}`,
		amount: tx.amount,
		categoryId: 'bills',
		paymentMethod: 'bank',
		recurrence: 'once',
		dueDay: null,
		dueDate,
		sourceTransactionId: tx.id,
		creditCardId: tx.paymentMethod === 'credit_card' ? tx.creditCardId ?? null : null,
		noExpenseOnPay: true,
		active: true
	};
}
