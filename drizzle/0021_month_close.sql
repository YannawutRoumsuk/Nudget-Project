CREATE TABLE "month_closures" (
	"user_id" integer NOT NULL,
	"month" varchar(7) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"carryover_mode" varchar(12) NOT NULL,
	"carryover_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"copied_plan" boolean DEFAULT false NOT NULL,
	"copied_budgets" boolean DEFAULT false NOT NULL,
	"carried_bill_count" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "month_closures_user_id_month_pk" PRIMARY KEY("user_id","month")
);
--> statement-breakpoint
ALTER TABLE "month_closures" ADD CONSTRAINT "month_closures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "month_closures_month_idx" ON "month_closures" USING btree ("month");