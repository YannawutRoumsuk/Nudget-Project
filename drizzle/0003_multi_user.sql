CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"line_user_id" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_line_user_id_unique" UNIQUE("line_user_id")
);
--> statement-breakpoint
DROP INDEX IF EXISTS "pending_slips_line_user_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_occurred_at_idx";--> statement-breakpoint
ALTER TABLE "bill_payments" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "monthly_plans" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "pending_slips" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "user_id" integer;--> statement-breakpoint
/*
 * Everything that already exists belonged to the single owner this ledger was
 * built for. Adopt those rows before the columns turn NOT NULL, otherwise the
 * migration drops real money on the floor. The owner's LINE id is recovered
 * from the ledger itself; `db:seed` reconciles it against LINE_ALLOWED_USER_ID
 * afterwards, which is what fixes the placeholder when no row carried an id.
 */
INSERT INTO "users" ("line_user_id")
SELECT COALESCE(
	(SELECT "line_user_id" FROM "transactions" WHERE "line_user_id" IS NOT NULL ORDER BY "id" LIMIT 1),
	(SELECT "line_user_id" FROM "pending_slips" ORDER BY "id" LIMIT 1),
	'legacy-owner'
)
WHERE EXISTS (SELECT 1 FROM "transactions")
	OR EXISTS (SELECT 1 FROM "bills")
	OR EXISTS (SELECT 1 FROM "monthly_plans")
	OR EXISTS (SELECT 1 FROM "pending_slips");--> statement-breakpoint
UPDATE "transactions" SET "user_id" = (SELECT MIN("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "bills" SET "user_id" = (SELECT MIN("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "bill_payments" SET "user_id" = (SELECT MIN("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "monthly_plans" SET "user_id" = (SELECT MIN("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "pending_slips" SET "user_id" = (SELECT MIN("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
DELETE FROM "reminder_deliveries" WHERE "user_id" IS NULL AND NOT EXISTS (SELECT 1 FROM "users");--> statement-breakpoint
UPDATE "reminder_deliveries" SET "user_id" = (SELECT MIN("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "bill_payments" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_plans" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_slips" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_plans" DROP CONSTRAINT IF EXISTS "monthly_plans_pkey";--> statement-breakpoint
ALTER TABLE "monthly_plans" ADD CONSTRAINT "monthly_plans_user_id_month_pk" PRIMARY KEY("user_id","month");--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_plans" ADD CONSTRAINT "monthly_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_slips" ADD CONSTRAINT "pending_slips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_slips_user_idx" ON "pending_slips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_user_occurred_at_idx" ON "transactions" USING btree ("user_id","occurred_at");
