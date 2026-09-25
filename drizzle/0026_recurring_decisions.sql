CREATE TABLE "recurring_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"merchant_key" varchar(120) NOT NULL,
	"status" varchar(16) NOT NULL,
	"bill_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_decisions" ADD CONSTRAINT "recurring_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_decisions" ADD CONSTRAINT "recurring_decisions_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_decisions_user_merchant_idx" ON "recurring_decisions" USING btree ("user_id","merchant_key");