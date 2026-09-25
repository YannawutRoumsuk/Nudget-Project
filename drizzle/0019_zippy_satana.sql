CREATE INDEX "llm_usage_created_at_idx" ON "llm_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "system_events_created_at_idx" ON "system_events" USING btree ("created_at");