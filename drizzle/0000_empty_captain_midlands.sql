CREATE TABLE "categories" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name_th" text NOT NULL,
	"name_en" text NOT NULL,
	"kind" varchar(8) NOT NULL,
	"icon" text NOT NULL,
	"color" varchar(16) NOT NULL,
	"sort_order" serial NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(8) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"category_id" varchar(32) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" varchar(8) NOT NULL,
	"parsed_by" varchar(8) NOT NULL,
	"raw_text" text DEFAULT '' NOT NULL,
	"line_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_occurred_at_idx" ON "transactions" USING btree ("occurred_at");