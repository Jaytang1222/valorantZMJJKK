ALTER TABLE "player_snapshots"
  ADD COLUMN "player_roles" player_role[];

UPDATE "player_snapshots"
SET "player_roles" = ARRAY["primary_role"]::player_role[]
WHERE "player_roles" IS NULL;

ALTER TABLE "player_snapshots"
  ALTER COLUMN "player_roles" SET DEFAULT ARRAY['flex']::player_role[],
  ALTER COLUMN "player_roles" SET NOT NULL;
