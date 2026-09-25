CREATE TABLE "credit_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"closing_day" integer NOT NULL,
	"due_day" integer NOT NULL,
	"credit_limit" numeric(12, 2),
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_installments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"credit_card_id" integer NOT NULL,
	"purchase_transaction_id" integer NOT NULL,
	"name" text NOT NULL,
	"category_id" varchar(32) NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"installment_amount" numeric(12, 2) NOT NULL,
	"total_installments" integer NOT NULL,
	"first_due_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_installments_purchase_transaction_id_unique" UNIQUE("purchase_transaction_id")
);
--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "credit_card_id" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "no_expense_on_pay" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "credit_installment_id" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "installment_number" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "credit_card_id" integer;--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_installments" ADD CONSTRAINT "credit_installments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_installments" ADD CONSTRAINT "credit_installments_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_installments" ADD CONSTRAINT "credit_installments_purchase_transaction_id_transactions_id_fk" FOREIGN KEY ("purchase_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_installments" ADD CONSTRAINT "credit_installments_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_cards_user_default_idx" ON "credit_cards" USING btree ("user_id") WHERE "credit_cards"."is_default" = true;--> statement-breakpoint
CREATE INDEX "credit_installments_user_card_idx" ON "credit_installments" USING btree ("user_id","credit_card_id");--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
UPDATE "bills" SET "no_expense_on_pay" = true WHERE "source_transaction_id" IS NOT NULL;
