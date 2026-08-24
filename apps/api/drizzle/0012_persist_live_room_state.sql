-- Custom SQL migration file, put your code below! --
ALTER TABLE "rooms" ADD COLUMN "live_state" jsonb;
