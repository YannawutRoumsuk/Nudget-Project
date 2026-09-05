import type { PaymentMethod, TxKind } from '$lib/server/db/schema';

/**
 * Shape a transaction takes once it crosses to the client: `numeric` is already
 * a number and `occurredAt` is a real Date (SvelteKit's devalue preserves it).
 */
export interface TxView {
	id: number;
	kind: TxKind;
	amount: number;
	categoryId: string;
	note: string;
	occurredAt: Date;
	source: string;
	paymentMethod: PaymentMethod;
}

export interface RangeOption {
	id: string;
	label: string;
}
