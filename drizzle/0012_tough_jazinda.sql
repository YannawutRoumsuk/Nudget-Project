ALTER TABLE "bills" ALTER COLUMN "payment_method" SET DATA TYPE varchar(24);--> statement-breakpoint
ALTER TABLE "bills" ALTER COLUMN "payment_method" SET DEFAULT 'bank';--> statement-breakpoint
ALTER TABLE "pending_slips" ALTER COLUMN "payment_method" SET DATA TYPE varchar(24);--> statement-breakpoint
ALTER TABLE "pending_slips" ALTER COLUMN "payment_method" SET DEFAULT 'bank';--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "payment_method" SET DATA TYPE varchar(24);--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "payment_method" SET DEFAULT 'bank';--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "source_transaction_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "bills_user_source_transaction_idx" ON "bills" USING btree ("user_id","source_transaction_id") WHERE "bills"."source_transaction_id" is not null;--> statement-breakpoint
INSERT INTO "bills" (
	"user_id", "name", "amount", "category_id", "payment_method", "recurrence",
	"due_date", "source_transaction_id", "active"
)
SELECT
	"user_id",
	CASE "payment_method"
		WHEN 'credit_card' THEN 'บัตรเครดิต: ' || coalesce(nullif(trim("note"), ''), 'รายการใช้จ่าย')
		ELSE 'Shopee PayLater: ' || coalesce(nullif(trim("note"), ''), 'รายการใช้จ่าย')
	END,
	"amount", 'bills', 'bank', 'once',
	((("occurred_at" AT TIME ZONE 'Asia/Bangkok') + interval '1 month')::date),
	"id", true
FROM "transactions"
WHERE "kind" = 'expense'
	AND "payment_method" IN ('credit_card', 'shopee_paylater')
	AND "occurred_at" >= (date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')
	AND "occurred_at" < ((date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok') + interval '1 month') AT TIME ZONE 'Asia/Bangkok')
ON CONFLICT DO NOTHING;
