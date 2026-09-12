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
export type FeedbackStatus = 'new' | 'read' | 'done';
/** A one-shot conversational mode that the next message answers. */
export type PendingAction = 'feedback';

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
	/**
	 * What the bot is waiting for this person to type next, e.g. the body of a
	 * feedback message. It lives here rather than in memory because a webhook is
	 * stateless and the process restarts on every deploy.
	 */
	pendingAction: varchar('pending_action', { length: 16 }).$type<PendingAction>(),
	pendingActionAt: timestamp('pending_action_at', { withTimezone: true }),
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
		/** Opaque source signature. Unique only inside one user's ledger. */
		fingerprint: varchar('fingerprint', { length: 64 }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('transactions_user_occurred_at_idx').on(t.userId, t.occurredAt),
		uniqueIndex('transactions_user_fingerprint_idx')
			.on(t.userId, t.fingerprint)
			.where(sql`${t.fingerprint} is not null`)
	]
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
		status: varchar('status', { length: 12 }).notNull().$type<'queued' | 'processing' | 'ready' | 'saving' | 'failed'>(),
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
		fingerprint: varchar('fingerprint', { length: 64 }),
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

/**
 * What a person told us in their own words. Kept even after the account is
 * revoked: the point of feedback is to survive the conversation that produced it.
 * `status` is the owner's queue, not the sender's — they never see it.
 */
export const feedback = pgTable(
	'feedback',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		lineUserId: text('line_user_id').notNull(),
		displayName: text('display_name').notNull().default(''),
		message: text('message').notNull(),
		status: varchar('status', { length: 8 }).notNull().$type<FeedbackStatus>().default('new'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		resolvedAt: timestamp('resolved_at', { withTimezone: true })
	},
	(t) => [index('feedback_status_created_idx').on(t.status, t.createdAt)]
);

/**
 * One row per person per announced release. The primary key is what makes
 * `release:announce` safe to re-run after a half-finished rollout.
 */
export const releaseDeliveries = pgTable(
	'release_deliveries',
	{
		userId: ownerId(),
		version: varchar('version', { length: 32 }).notNull(),
		sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.userId, t.version] })]
);

/**
 * One LLM-written read of a month, kept so reopening the page costs nothing.
 * `fingerprint` hashes the numbers the analysis was built from: a new entry
 * changes it and earns a fresh read, while a reload does not.
 */
export const insights = pgTable(
	'insights',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		month: varchar('month', { length: 7 }).notNull(),
		fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
		/** The generated analysis as JSON. Re-validated on read, never trusted raw. */
		payload: text('payload').notNull(),
		model: varchar('model', { length: 64 }).notNull().default(''),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('insights_user_month_fingerprint_idx').on(t.userId, t.month, t.fingerprint)]
);

/**
 * How many paid model calls one person has spent today. Its own table rather
 * than a count over `insights`, because the guard has to be a single atomic
 * statement: counting first and inserting afterwards lets two requests that
 * overlap both read the same total and both pass.
 */
export const llmQuota = pgTable(
	'llm_quota',
	{
		userId: ownerId(),
		/** Bangkok calendar day, `YYYY-MM-DD`. */
		day: varchar('day', { length: 10 }).notNull(),
		workflow: varchar('workflow', { length: 24 }).notNull().default('insights'),
		used: integer('used').notNull().default(0)
	},
	(t) => [primaryKey({ columns: [t.userId, t.day, t.workflow] })]
);

/** Provider usage without prompts or financial text. */
export const llmUsage = pgTable(
	'llm_usage',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		workflow: varchar('workflow', { length: 24 }).notNull(),
		provider: varchar('provider', { length: 16 }).notNull(),
		model: varchar('model', { length: 64 }).notNull(),
		inputTokens: integer('input_tokens').notNull().default(0),
		outputTokens: integer('output_tokens').notNull().default(0),
		success: boolean('success').notNull(),
		errorCode: varchar('error_code', { length: 32 }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('llm_usage_user_created_idx').on(t.userId, t.createdAt)]
);

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Bill = typeof bills.$inferSelect;
export type MonthlyPlan = typeof monthlyPlans.$inferSelect;
export type PendingSlip = typeof pendingSlips.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type ReleaseDelivery = typeof releaseDeliveries.$inferSelect;
export type StoredInsight = typeof insights.$inferSelect;
