ALTER TABLE "player_snapshots"
  ADD COLUMN "age" integer NOT NULL DEFAULT 20;

ALTER TABLE "player_snapshots"
  ADD CONSTRAINT "player_snapshots_age_range_check"
  CHECK ("age" >= 13 AND "age" <= 60);
