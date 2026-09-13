import { categoryLabel } from '$lib/categories';
import type { PaymentMethod, TxKind } from '$lib/server/db/schema';
import { addMonths } from '$lib/utils/date';

export interface DeferredPurchase {
	id: number;
	userId: number;
	kind: TxKind;
	amount: string;
	categoryId: string;
	note: string;
	occurredAt: Date;
	paymentMethod: PaymentMethod;
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
	active: true;
}

/** One deferred purchase is paid next month but remains spending in its purchase month. */
export function deferredBillForTransaction(tx: DeferredPurchase): DeferredBillDraft | null {
	if (tx.kind !== 'expense' || !['credit_card', 'shopee_paylater'].includes(tx.paymentMethod)) return null;
	const source = tx.paymentMethod === 'credit_card' ? 'บัตรเครดิต' : 'Shopee PayLater';
	const detail = tx.note.trim() || categoryLabel(tx.categoryId);
	return {
		userId: tx.userId,
		name: `${source}: ${detail}`,
		amount: tx.amount,
		categoryId: 'bills',
		paymentMethod: 'bank',
		recurrence: 'once',
		dueDay: null,
		dueDate: addMonths(tx.occurredAt, 1),
		sourceTransactionId: tx.id,
		active: true
	};
}
