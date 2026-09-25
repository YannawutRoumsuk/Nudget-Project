CREATE TABLE "what_if_scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"month" varchar(7) NOT NULL,
	"name" varchar(80) NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "what_if_scenarios" ADD CONSTRAINT "what_if_scenarios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "what_if_scenarios_user_month_idx" ON "what_if_scenarios" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX "what_if_scenarios_user_idx" ON "what_if_scenarios" USING btree ("user_id");