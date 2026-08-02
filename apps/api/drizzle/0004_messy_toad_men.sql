ALTER TABLE "rooms" ADD COLUMN "ranked_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "rooms" SET "ranked_eligible" = true WHERE "is_matchmade" = true AND "state" = 'finished' AND "winner_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "rooms_ranked_eligible_idx" ON "rooms" USING btree ("ranked_eligible","finished_at");
