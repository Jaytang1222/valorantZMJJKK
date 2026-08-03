ALTER TYPE "public"."player_role" ADD VALUE 'coach';--> statement-breakpoint
ALTER TABLE "player_snapshots" ADD COLUMN "is_active_roster" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "player_snapshots" ADD COLUMN "is_coach" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "player_snapshots" ADD COLUMN "is_featured_team" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "player_snapshots" ADD COLUMN "is_vct_cn_team" boolean DEFAULT false NOT NULL;