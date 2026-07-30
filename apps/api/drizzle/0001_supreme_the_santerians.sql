CREATE TYPE "public"."attempt_status" AS ENUM('active', 'won', 'lost', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."leaderboard_mode" AS ENUM('solo', 'versus');--> statement-breakpoint
CREATE TYPE "public"."participant_state" AS ENUM('connected', 'disconnected', 'forfeited', 'left');--> statement-breakpoint
CREATE TYPE "public"."room_state" AS ENUM('lobby', 'countdown', 'playing', 'round_result', 'finished', 'cancelled');--> statement-breakpoint
CREATE TABLE "guesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solo_attempt_id" uuid,
	"room_round_id" uuid,
	"user_id" uuid,
	"guessed_player_id" uuid NOT NULL,
	"is_correct" boolean NOT NULL,
	"comparison" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "leaderboard_mode" NOT NULL,
	"user_id" uuid NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"total_guesses" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"state" "participant_state" DEFAULT 'connected' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone,
	"forfeited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "room_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"puzzle_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(6),
	"host_id" uuid NOT NULL,
	"state" "room_state" DEFAULT 'lobby' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"round_count" integer DEFAULT 1 NOT NULL,
	"round_duration_seconds" integer DEFAULT 60 NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "solo_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"puzzle_id" uuid NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"status" "attempt_status" DEFAULT 'active' NOT NULL,
	"guess_count" integer DEFAULT 0 NOT NULL,
	"score" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "guesses" ADD CONSTRAINT "guesses_solo_attempt_id_solo_attempts_id_fk" FOREIGN KEY ("solo_attempt_id") REFERENCES "public"."solo_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guesses" ADD CONSTRAINT "guesses_room_round_id_room_rounds_id_fk" FOREIGN KEY ("room_round_id") REFERENCES "public"."room_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guesses" ADD CONSTRAINT "guesses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guesses" ADD CONSTRAINT "guesses_guessed_player_id_players_id_fk" FOREIGN KEY ("guessed_player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_rounds" ADD CONSTRAINT "room_rounds_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_rounds" ADD CONSTRAINT "room_rounds_puzzle_id_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."puzzles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solo_attempts" ADD CONSTRAINT "solo_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solo_attempts" ADD CONSTRAINT "solo_attempts_puzzle_id_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."puzzles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guesses_solo_attempt_idx" ON "guesses" USING btree ("solo_attempt_id");--> statement-breakpoint
CREATE INDEX "guesses_room_round_idx" ON "guesses" USING btree ("room_round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_entries_mode_user_unique" ON "leaderboard_entries" USING btree ("mode","user_id");--> statement-breakpoint
CREATE INDEX "leaderboard_entries_mode_score_idx" ON "leaderboard_entries" USING btree ("mode","total_score");--> statement-breakpoint
CREATE UNIQUE INDEX "room_participants_room_user_unique" ON "room_participants" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "room_participants_room_state_idx" ON "room_participants" USING btree ("room_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "room_rounds_room_number_unique" ON "room_rounds" USING btree ("room_id","round_number");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_code_unique" ON "rooms" USING btree ("code");--> statement-breakpoint
CREATE INDEX "rooms_state_public_idx" ON "rooms" USING btree ("state","is_public");--> statement-breakpoint
CREATE INDEX "solo_attempts_user_started_idx" ON "solo_attempts" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "solo_attempts_puzzle_idx" ON "solo_attempts" USING btree ("puzzle_id");