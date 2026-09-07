import { sql } from 'drizzle-orm';
import {
	boolean,
	date,
	index,
	integer,
	numeric,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex,
	varchar
} from 'drizzle-orm/pg-core';

/** Expense vs income. Stored as text so new kinds never need a migration dance. */
export type TxKind = 'expense' | 'income';
export type PaymentMethod = 'bank' | 'cash' | 'credit_card' | 'wallet';
export type BillRecurrence = 'monthly' | 'once';

/**
 * Categories are seeded rather than user-managed for now — the parser maps
 * keywords onto these slugs, so the set has to stay in sync with
 * `$lib/categories`.
 */
export const categories = pgTable('categories', {
	id: varchar('id', { length: 32 }).primaryKey(),
	nameTh: text('name_th').notNull(),
	nameEn: text('name_en').notNull(),
	kind: varchar('kind', { length: 8 }).notNull().$type<TxKind>(),
	icon: text('icon').notNull(),
	color: varchar('color', { length: 32 }).notNull(),
	sortOrder: serial('sort_order')
});

/**
 * One row per LINE account that may use the ledger. Every owned table carries a
 * `user_id` pointing here — that column is the whole tenant boundary, so a query
 * that forgets it leaks another person's money.
 */
export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	lineUserId: text('line_user_id').notNull().unique(),
	displayName: text('display_name').notNull().default(''),
	/**
	 * Revoking access flips this rather than deleting the row — a delete would
	 * cascade away every baht the person ever recorded.
	 */
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});


const ownerId = () =>
	integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' });

export const monthlyPlans = pgTable(
	'monthly_plans',
	{
		userId: ownerId(),
		month: varchar('month', { length: 7 }).notNull(),
		expectedIncome: numeric('expected_income', { precision: 12, scale: 2 }).notNull().default('0'),
		savingsGoal: numeric('savings_goal', { precision: 12, scale: 2 }).notNull().default('0'),
		foodDailyBudget: numeric('food_daily_budget', { precision: 10, scale: 2 }).notNull().default('0'),
		commuteDailyBudget: numeric('commute_daily_budget', { precision: 10, scale: 2 }).notNull().default('0'),
		commuteDays: integer('commute_days').notNull().default(0),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.userId, t.month] })]
);

export const bills = pgTable('bills', {
	id: serial('id').primaryKey(),
	userId: ownerId(),
	name: text('name').notNull(),
	amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
	categoryId: varchar('category_id', { length: 32 })
		.notNull()
		.references(() => categories.id),
	paymentMethod: varchar('payment_method', { length: 16 }).notNull().$type<PaymentMethod>().default('bank'),
	recurrence: varchar('recurrence', { length: 8 }).notNull().$type<BillRecurrence>(),
	dueDay: integer('due_day'),
	dueDate: date('due_date', { mode: 'date' }),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const transactions = pgTable(
	'transactions',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		kind: varchar('kind', { length: 8 }).notNull().$type<TxKind>(),
		/** Always positive. Direction lives in `kind`, never in the sign. */
		amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
		categoryId: varchar('category_id', { length: 32 })
			.notNull()
			.references(() => categories.id),
		note: text('note').notNull().default(''),
		/** Instant the money moved, not the instant we recorded it. */
		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
		paymentMethod: varchar('payment_method', { length: 16 }).notNull().$type<PaymentMethod>().default('bank'),
		billId: integer('bill_id').references(() => bills.id, { onDelete: 'set null' }),
		source: varchar('source', { length: 8 }).notNull().$type<'line' | 'web'>(),
		parsedBy: varchar('parsed_by', { length: 8 }).notNull().$type<'rule' | 'llm' | 'manual' | 'ocr'>(),
		/** Original LINE message, kept so a mis-parse can be diagnosed later. */
		rawText: text('raw_text').notNull().default(''),
		lineUserId: text('line_user_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('transactions_user_occurred_at_idx').on(t.userId, t.occurredAt)]
);

export const billPayments = pgTable(
	'bill_payments',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		billId: integer('bill_id').notNull().references(() => bills.id, { onDelete: 'cascade' }),
		period: varchar('period', { length: 10 }).notNull(),
		transactionId: integer('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
		paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('bill_payments_bill_period_idx').on(t.billId, t.period)]
);

export const pendingSlips = pgTable(
	'pending_slips',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		lineUserId: text('line_user_id').notNull(),
		messageId: text('message_id').notNull(),
		status: varchar('status', { length: 12 }).notNull().$type<'queued' | 'processing' | 'ready' | 'failed'>(),
		amount: numeric('amount', { precision: 12, scale: 2 }),
		occurredAt: timestamp('occurred_at', { withTimezone: true }),
		categoryId: varchar('category_id', { length: 32 })
			.notNull()
			.default('other')
			.references(() => categories.id),
		paymentMethod: varchar('payment_method', { length: 16 }).notNull().$type<PaymentMethod>().default('bank'),
		note: text('note').notNull().default(''),
		recipient: text('recipient').notNull().default(''),
		reference: text('reference').notNull().default(''),
		ocrText: text('ocr_text').notNull().default(''),
		expiresAt: timestamp('expires_at', { withTimezone: true })
			.notNull()
			.default(sql`now() + interval '24 hours'`),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('pending_slips_user_idx').on(t.userId)]
);

export const reminderDeliveries = pgTable('reminder_deliveries', {
	key: text('key').primaryKey(),
	userId: ownerId(),
	sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * LINE redelivers webhook events on timeout. Recording every processed event id
 * is what keeps a retry from double-charging the ledger.
 */
export const processedEvents = pgTable('processed_events', {
	eventId: text('event_id').primaryKey(),
	processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow()
});

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Bill = typeof bills.$inferSelect;
export type MonthlyPlan = typeof monthlyPlans.$inferSelect;
export type PendingSlip = typeof pendingSlips.$inferSelect;
