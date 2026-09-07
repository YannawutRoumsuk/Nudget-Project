ALTER TABLE "pending_slips" ADD COLUMN "category_id" varchar(32) DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_slips" ADD COLUMN "payment_method" varchar(16) DEFAULT 'bank' NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_slips" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_slips" ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_slips" ADD CONSTRAINT "pending_slips_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;