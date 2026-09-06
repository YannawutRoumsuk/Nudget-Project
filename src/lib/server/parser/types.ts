import type { PaymentMethod, TxKind } from '$lib/server/db/schema';

export interface ParsedTransaction {
	kind: TxKind;
	/** Always positive, in baht. */
	amount: number;
	categoryId: string;
	note: string;
	occurredAt: Date;
	parsedBy: 'rule' | 'llm';
	paymentMethod?: PaymentMethod;
}

export type BotCommand = 'help' | 'today' | 'month' | 'summary' | 'bills' | 'budget' | 'undo' | 'whoami' | 'invite';

export type ParseOutcome =
	| { type: 'command'; command: BotCommand }
	| { type: 'transaction'; tx: ParsedTransaction }
	| { type: 'unknown'; text: string };
