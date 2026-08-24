ALTER TABLE "player_snapshots"
  ADD COLUMN "league_titles" integer DEFAULT 0 NOT NULL;

ALTER TABLE "player_snapshots"
  DROP COLUMN "champions_appearances";
