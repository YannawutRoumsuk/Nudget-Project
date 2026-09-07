import type { PaymentMethod, TxKind } from '$lib/server/db/schema';
import type { InstallmentPlan } from './installment';

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

export type BotCommand = 'help' | 'today' | 'month' | 'summary' | 'bills' | 'budget' | 'undo' | 'whoami' | 'members' | 'web';

export type ParseOutcome =
	| { type: 'command'; command: BotCommand }
	| { type: 'transaction'; tx: ParsedTransaction }
	/** A payment plan: several future bills rather than money already spent. */
	| { type: 'installment'; plan: InstallmentPlan }
	| { type: 'unknown'; text: string };
