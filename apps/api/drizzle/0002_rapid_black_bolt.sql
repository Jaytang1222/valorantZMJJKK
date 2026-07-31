DROP INDEX "users_display_name_unique";--> statement-breakpoint
ALTER TABLE "solo_attempts" ADD COLUMN "guest_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "normalized_display_name" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" varchar(320);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "normalized_email" varchar(320);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_email_unique" ON "users" USING btree ("normalized_email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_display_name_unique" ON "users" USING btree ("normalized_display_name");