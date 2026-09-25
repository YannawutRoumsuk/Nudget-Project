CREATE TABLE "user_category_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"keyword" varchar(64) NOT NULL,
	"category_id" varchar(32) NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"saved_llm_calls" integer DEFAULT 0 NOT NULL,
	"last_matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_category_rules" ADD CONSTRAINT "user_category_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_category_rules" ADD CONSTRAINT "user_category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_category_rules_user_keyword_idx" ON "user_category_rules" USING btree ("user_id","keyword");--> statement-breakpoint
CREATE INDEX "user_category_rules_user_idx" ON "user_category_rules" USING btree ("user_id");