DO $$ BEGIN
 CREATE TYPE "public"."roster_status" AS ENUM('active', 'benched', 'transferred', 'retired', 'inactive');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
ALTER TABLE "player_snapshots" ADD COLUMN IF NOT EXISTS "roster_status" "roster_status" DEFAULT 'active' NOT NULL;
UPDATE "player_snapshots" SET "roster_status" = 'retired' WHERE "is_active_roster" = false AND "roster_status" = 'active';
