CREATE TABLE "bill_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"bill_id" integer NOT NULL,
	"period" varchar(10) NOT NULL,
	"transaction_id" integer,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"category_id" varchar(32) NOT NULL,
	"payment_method" varchar(16) DEFAULT 'bank' NOT NULL,
	"recurrence" varchar(8) NOT NULL,
	"due_day" integer,
	"due_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_plans" (
	"month" varchar(7) PRIMARY KEY NOT NULL,
	"expected_income" numeric(12, 2) DEFAULT '0' NOT NULL,
	"savings_goal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"food_daily_budget" numeric(10, 2) DEFAULT '0' NOT NULL,
	"commute_daily_budget" numeric(10, 2) DEFAULT '0' NOT NULL,
	"commute_days" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_slips" (
	"id" serial PRIMARY KEY NOT NULL,
	"line_user_id" text NOT NULL,
	"message_id" text NOT NULL,
	"status" varchar(12) NOT NULL,
	"amount" numeric(12, 2),
	"occurred_at" timestamp with time zone,
	"recipient" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"ocr_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_deliveries" (
	"key" text PRIMARY KEY NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "payment_method" varchar(16) DEFAULT 'bank' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "bill_id" integer;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_payments_bill_period_idx" ON "bill_payments" USING btree ("bill_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_slips_line_user_idx" ON "pending_slips" USING btree ("line_user_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE set null ON UPDATE no action;