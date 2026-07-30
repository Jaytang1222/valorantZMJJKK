CREATE TYPE "public"."difficulty" AS ENUM('beginner', 'easy', 'full');--> statement-breakpoint
CREATE TYPE "public"."player_role" AS ENUM('duelist', 'initiator', 'controller', 'sentinel', 'flex');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('americas', 'emea', 'pacific', 'china');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "country_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"display_name" varchar(64) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"alias" varchar(64) NOT NULL,
	"normalized_alias" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"data_version" integer NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"country_group_code" varchar(64) NOT NULL,
	"region" "region" NOT NULL,
	"primary_role" "player_role" NOT NULL,
	"current_or_last_team" varchar(128) NOT NULL,
	"champions_titles" integer DEFAULT 0 NOT NULL,
	"masters_titles" integer DEFAULT 0 NOT NULL,
	"hero_top_3" jsonb NOT NULL,
	"data_as_of" timestamp with time zone NOT NULL,
	"source_url" text NOT NULL,
	"source_checked_at" timestamp with time zone NOT NULL,
	"review_status" "review_status" DEFAULT 'pending_review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" varchar(64) NOT NULL,
	"status" "player_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puzzles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"status" "review_status" DEFAULT 'pending_review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(20) NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_aliases" ADD CONSTRAINT "player_aliases_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_snapshots" ADD CONSTRAINT "player_snapshots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_snapshot_id_player_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."player_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "country_groups_code_version_unique" ON "country_groups" USING btree ("code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "player_aliases_normalized_alias_unique" ON "player_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "player_aliases_player_id_idx" ON "player_aliases" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_snapshots_player_version_unique" ON "player_snapshots" USING btree ("player_id","data_version");--> statement-breakpoint
CREATE INDEX "player_snapshots_review_status_idx" ON "player_snapshots" USING btree ("review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "players_canonical_name_unique" ON "players" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "puzzles_difficulty_status_idx" ON "puzzles" USING btree ("difficulty","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_display_name_unique" ON "users" USING btree ("display_name");