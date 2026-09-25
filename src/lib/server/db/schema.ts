import { sql } from 'drizzle-orm';
import {
	boolean,
	date,
	index,
	integer,
	jsonb,
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
export type PaymentMethod = 'bank' | 'cash' | 'credit_card' | 'shopee_paylater' | 'wallet';
export type BillRecurrence = 'monthly' | 'once';
export type FeedbackStatus = 'new' | 'read' | 'done';
/** A one-shot conversational mode that the next message answers. */
export type PendingAction = 'feedback' | 'ai_help';

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
	/** Private owner-only support note; never included in member-facing responses. */
	memberNote: text('member_note').notNull().default(''),
	/** Last authenticated web or LINE interaction, independent of backdated ledger entries. */
	lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
	notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
	notificationHour: integer('notification_hour').notNull().default(18),
	timezone: text('timezone').notNull().default('Asia/Bangkok'),
	quietHoursStart: integer('quiet_hours_start').notNull().default(22),
	quietHoursEnd: integer('quiet_hours_end').notNull().default(7),
	billReminderDaysBefore: integer('bill_reminder_days_before').notNull().default(3),
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
		expectedIncomeDay: integer('expected_income_day').notNull().default(1),
		savingsGoal: numeric('savings_goal', { precision: 12, scale: 2 }).notNull().default('0'),
		foodDailyBudget: numeric('food_daily_budget', { precision: 10, scale: 2 }).notNull().default('0'),
		commuteDailyBudget: numeric('commute_daily_budget', { precision: 10, scale: 2 }).notNull().default('0'),
		commuteDays: integer('commute_days').notNull().default(0),
		budgetAlertsEnabled: boolean('budget_alerts_enabled').notNull().default(true),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.userId, t.month] })]
);

export type SavingsGoalStatus = 'active' | 'paused' | 'closed' | 'completed';

/** User-owned sinking funds. Contributions are transfers between pockets, not expenses. */
export const savingsGoals = pgTable(
	'savings_goals',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		name: text('name').notNull(),
		targetAmount: numeric('target_amount', { precision: 12, scale: 2 }).notNull(),
		currentAmount: numeric('current_amount', { precision: 12, scale: 2 }).notNull().default('0'),
		targetDate: date('target_date', { mode: 'date' }),
		monthlyContribution: numeric('monthly_contribution', { precision: 12, scale: 2 }).notNull().default('0'),
		priority: integer('priority').notNull().default(3),
		status: varchar('status', { length: 12 }).notNull().default('active').$type<SavingsGoalStatus>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('savings_goals_user_status_priority_idx').on(t.userId, t.status, t.priority)]
);

export const savingsGoalContributions = pgTable(
	'savings_goal_contributions',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		goalId: integer('goal_id').notNull().references(() => savingsGoals.id, { onDelete: 'cascade' }),
		amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('savings_goal_contributions_user_goal_idx').on(t.userId, t.goalId, t.createdAt)]
);

export const monthlyCategoryBudgets = pgTable(
	'monthly_category_budgets',
	{
		userId: ownerId(),
		month: varchar('month', { length: 7 }).notNull(),
		categoryId: varchar('category_id', { length: 32 }).notNull().references(() => categories.id, { onDelete: 'cascade' }),
		amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.month, t.categoryId] }),
		index('monthly_category_budgets_month_idx').on(t.userId, t.month)
	]
);

export type MonthCloseCarryover = 'spendable' | 'savings' | 'none';
export interface MonthCloseSnapshot {
	income: number;
	expense: number;
	remaining: number;
	unpaidBills: number;
	unpaidBillCount: number;
	categorySpend: Array<{ categoryId: string; amount: number }>;
	refreshedAt: string;
}

/** One close per owner and month; refreshing updates the live snapshot without replaying copies. */
export const monthClosures = pgTable(
	'month_closures',
	{
		userId: ownerId(),
		month: varchar('month', { length: 7 }).notNull(),
		snapshot: jsonb('snapshot').notNull().$type<MonthCloseSnapshot>(),
		carryoverMode: varchar('carryover_mode', { length: 12 }).notNull().$type<MonthCloseCarryover>(),
		carryoverAmount: numeric('carryover_amount', { precision: 12, scale: 2 }).notNull().default('0'),
		copiedPlan: boolean('copied_plan').notNull().default(false),
		copiedBudgets: boolean('copied_budgets').notNull().default(false),
		carriedBillCount: integer('carried_bill_count').notNull().default(0),
		closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.userId, t.month] }), index('month_closures_month_idx').on(t.month)]
);

/** Card metadata only; never store a full card number or security code. */
export const creditCards = pgTable(
	'credit_cards',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		name: text('name').notNull(),
		closingDay: integer('closing_day').notNull(),
		dueDay: integer('due_day').notNull(),
		creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }),
		isDefault: boolean('is_default').notNull().default(false),
		active: boolean('active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('credit_cards_user_default_idx').on(t.userId).where(sql`${t.isDefault} = true`)]
);

export const bills = pgTable(
	'bills',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		name: text('name').notNull(),
		amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
		categoryId: varchar('category_id', { length: 32 })
			.notNull()
			.references(() => categories.id),
		paymentMethod: varchar('payment_method', { length: 24 }).notNull().$type<PaymentMethod>().default('bank'),
		recurrence: varchar('recurrence', { length: 8 }).notNull().$type<BillRecurrence>(),
		dueDay: integer('due_day'),
		dueDate: date('due_date', { mode: 'date' }),
		/** Purchase that created this next-month obligation; null for hand-made bills. */
		sourceTransactionId: integer('source_transaction_id'),
		creditCardId: integer('credit_card_id').references(() => creditCards.id, { onDelete: 'set null' }),
		/** Card settlements and installment bills track obligations, not new spending. */
		noExpenseOnPay: boolean('no_expense_on_pay').notNull().default(false),
		creditInstallmentId: integer('credit_installment_id'),
		installmentNumber: integer('installment_number'),
		active: boolean('active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('bills_user_source_transaction_idx')
			.on(t.userId, t.sourceTransactionId)
			.where(sql`${t.sourceTransactionId} is not null`)
	]
);

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
		paymentMethod: varchar('payment_method', { length: 24 }).notNull().$type<PaymentMethod>().default('bank'),
		creditCardId: integer('credit_card_id').references(() => creditCards.id, { onDelete: 'set null' }),
		billId: integer('bill_id').references(() => bills.id, { onDelete: 'set null' }),
		source: varchar('source', { length: 8 }).notNull().$type<'line' | 'web'>(),
		parsedBy: varchar('parsed_by', { length: 8 }).notNull().$type<'rule' | 'llm' | 'manual' | 'ocr'>(),
		/** Original LINE message, kept so a mis-parse can be diagnosed later. */
		rawText: text('raw_text').notNull().default(''),
		lineUserId: text('line_user_id'),
		/** Opaque source signature. Unique only inside one user's ledger. */
		fingerprint: varchar('fingerprint', { length: 64 }),
		/** Omit this purchase from future comparison baselines without deleting it. */
		excludeFromBaseline: boolean('exclude_from_baseline').notNull().default(false),
		/** The owner has acknowledged this statistical flag. */
		anomalyDismissed: boolean('anomaly_dismissed').notNull().default(false),
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

/** A purchase recorded once, with future per-installment obligations. */
export const creditInstallments = pgTable(
	'credit_installments',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		creditCardId: integer('credit_card_id').notNull().references(() => creditCards.id, { onDelete: 'cascade' }),
		purchaseTransactionId: integer('purchase_transaction_id').notNull().unique().references(() => transactions.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		categoryId: varchar('category_id', { length: 32 }).notNull().references(() => categories.id),
		totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
		installmentAmount: numeric('installment_amount', { precision: 12, scale: 2 }).notNull(),
		totalInstallments: integer('total_installments').notNull(),
		firstDueDate: date('first_due_date', { mode: 'date' }).notNull(),
		active: boolean('active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('credit_installments_user_card_idx').on(t.userId, t.creditCardId)]
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
		paymentMethod: varchar('payment_method', { length: 24 }).notNull().$type<PaymentMethod>().default('bank'),
		note: text('note').notNull().default(''),
		recipient: text('recipient').notNull().default(''),
		reference: text('reference').notNull().default(''),
		ocrText: text('ocr_text').notNull().default(''),
		ocrProvider: varchar('ocr_provider', { length: 16 }).notNull().default('tesseract'),
		amountConfidence: numeric('amount_confidence', { precision: 3, scale: 2 }),
		dateConfidence: numeric('date_confidence', { precision: 3, scale: 2 }),
		recipientConfidence: numeric('recipient_confidence', { precision: 3, scale: 2 }),
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

/** Low-cardinality operational counters only; never store payloads, identities, or secrets. */
export const systemEvents = pgTable(
	'system_events',
	{
		id: serial('id').primaryKey(),
		eventType: varchar('event_type', { length: 24 }).notNull(),
		success: boolean('success').notNull().default(true),
		errorCode: varchar('error_code', { length: 32 }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('system_events_type_created_idx').on(t.eventType, t.createdAt),
		index('system_events_created_at_idx').on(t.createdAt)
	]
);

/** Owner-only audit trail for support actions; account deletion cascades its data. */
export const adminAuditLogs = pgTable(
	'admin_audit_logs',
	{
		id: serial('id').primaryKey(),
		actorUserId: integer('actor_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		actorLineUserId: text('actor_line_user_id').notNull(),
		targetUserId: integer('target_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		action: varchar('action', { length: 24 }).notNull(),
		entity: varchar('entity', { length: 24 }).notNull(),
		entityId: varchar('entity_id', { length: 64 }).notNull(),
		changes: jsonb('changes').$type<{ before: unknown; after: unknown }>().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('admin_audit_target_created_idx').on(t.targetUserId, t.createdAt)]
);

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

/** Admin-auditable AI help transcript. Financial entries never enter this table. */
export const aiConversations = pgTable(
	'ai_conversations',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		userMessage: text('user_message').notNull(),
		assistantMessage: text('assistant_message').notNull(),
		provider: varchar('provider', { length: 16 }).notNull(),
		model: varchar('model', { length: 64 }).notNull(),
		inputTokens: integer('input_tokens').notNull().default(0),
		outputTokens: integer('output_tokens').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('ai_conversations_user_created_idx').on(t.userId, t.createdAt)]
);

/** Private per-account merchant/category rules learned from explicit user edits. */
export const userCategoryRules = pgTable(
	'user_category_rules',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		keyword: varchar('keyword', { length: 64 }).notNull(),
		categoryId: varchar('category_id', { length: 32 }).notNull().references(() => categories.id, { onDelete: 'cascade' }),
		matchCount: integer('match_count').notNull().default(0),
		savedLlmCalls: integer('saved_llm_calls').notNull().default(0),
		lastMatchedAt: timestamp('last_matched_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('user_category_rules_user_keyword_idx').on(t.userId, t.keyword),
		index('user_category_rules_user_idx').on(t.userId)
	]
);

/** User-owned, non-financial what-if drafts. Applying a draft is a separate explicit action. */
export const whatIfScenarios = pgTable(
	'what_if_scenarios',
	{
		id: serial('id').primaryKey(),
		userId: ownerId(),
		month: varchar('month', { length: 7 }).notNull(),
		name: varchar('name', { length: 80 }).notNull(),
		changes: jsonb('changes').notNull().$type<unknown[]>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('what_if_scenarios_user_month_idx').on(t.userId, t.month), index('what_if_scenarios_user_idx').on(t.userId)]
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
	(t) => [
		index('llm_usage_user_created_idx').on(t.userId, t.createdAt),
		index('llm_usage_provider_created_idx').on(t.provider, t.createdAt),
		index('llm_usage_created_at_idx').on(t.createdAt)
	]
);

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Bill = typeof bills.$inferSelect;
export type CreditCard = typeof creditCards.$inferSelect;
export type MonthlyCategoryBudget = typeof monthlyCategoryBudgets.$inferSelect;
export type MonthlyPlan = typeof monthlyPlans.$inferSelect;
export type PendingSlip = typeof pendingSlips.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type AiConversation = typeof aiConversations.$inferSelect;
export type UserCategoryRule = typeof userCategoryRules.$inferSelect;
export type WhatIfScenario = typeof whatIfScenarios.$inferSelect;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type ReleaseDelivery = typeof releaseDeliveries.$inferSelect;
export type StoredInsight = typeof insights.$inferSelect;
