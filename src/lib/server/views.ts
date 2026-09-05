import type { Transaction } from '$lib/server/db/schema';
import type { TxView } from '$lib/types';
import { toNumber } from '$lib/utils/money';

/** Postgres `numeric` is a string on the wire; the UI wants a number. */
export function toTxView(row: Transaction): TxView {
	return {
		id: row.id,
		kind: row.kind,
		amount: toNumber(row.amount),
		categoryId: row.categoryId,
		note: row.note,
		occurredAt: row.occurredAt,
		source: row.source,
		paymentMethod: row.paymentMethod
	};
}
