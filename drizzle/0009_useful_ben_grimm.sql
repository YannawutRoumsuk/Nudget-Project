ALTER TABLE "pending_slips" ADD COLUMN "ocr_provider" varchar(16) DEFAULT 'tesseract' NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_slips" ADD COLUMN "amount_confidence" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "pending_slips" ADD COLUMN "date_confidence" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "pending_slips" ADD COLUMN "recipient_confidence" numeric(3, 2);