ALTER TABLE "pending_slips" ADD COLUMN "fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "fingerprint" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_user_fingerprint_idx" ON "transactions" USING btree ("user_id","fingerprint") WHERE "transactions"."fingerprint" is not null;