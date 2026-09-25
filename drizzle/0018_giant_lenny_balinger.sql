CREATE TABLE "system_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" varchar(24) NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error_code" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "system_events_type_created_idx" ON "system_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "llm_usage_provider_created_idx" ON "llm_usage" USING btree ("provider","created_at");