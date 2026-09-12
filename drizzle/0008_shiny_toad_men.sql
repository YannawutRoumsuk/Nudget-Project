CREATE TABLE "llm_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"workflow" varchar(24) NOT NULL,
	"provider" varchar(16) NOT NULL,
	"model" varchar(64) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"success" boolean NOT NULL,
	"error_code" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_quota" ADD COLUMN "workflow" varchar(24) DEFAULT 'insights' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_quota" DROP CONSTRAINT "llm_quota_user_id_day_pk";--> statement-breakpoint
ALTER TABLE "llm_quota" ADD CONSTRAINT "llm_quota_user_id_day_workflow_pk" PRIMARY KEY("user_id","day","workflow");--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_usage_user_created_idx" ON "llm_usage" USING btree ("user_id","created_at");
