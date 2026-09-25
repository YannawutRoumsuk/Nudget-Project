CREATE TABLE "monthly_category_budgets" (
	"user_id" integer NOT NULL,
	"month" varchar(7) NOT NULL,
	"category_id" varchar(32) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_category_budgets_user_id_month_category_id_pk" PRIMARY KEY("user_id","month","category_id")
);
--> statement-breakpoint
ALTER TABLE "monthly_plans" ADD COLUMN "budget_alerts_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_category_budgets" ADD CONSTRAINT "monthly_category_budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_category_budgets" ADD CONSTRAINT "monthly_category_budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monthly_category_budgets_month_idx" ON "monthly_category_budgets" USING btree ("user_id","month");