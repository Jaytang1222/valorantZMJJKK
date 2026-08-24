import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const databaseTestsEnabled = process.env.RUN_DATABASE_TESTS === "true";
const testSuite = databaseTestsEnabled ? describe : describe.skip;
const database = databaseTestsEnabled
  ? await import("../db/client.js")
  : undefined;
const schema = databaseTestsEnabled
  ? await import("../db/schema.js")
  : undefined;
const playerImport = databaseTestsEnabled
  ? await import("./player-import.js")
  : undefined;

testSuite("latest player snapshot updates", () => {
  const playerId = randomUUID();
  const snapshotId = randomUUID();

  afterAll(async () => {
    if (!database || !schema) return;
    await database.db
      .delete(schema.playerSnapshots)
      .where(eq(schema.playerSnapshots.id, snapshotId));
    await database.db
      .delete(schema.players)
      .where(eq(schema.players.id, playerId));
    await database.closeDatabase();
  });

  it("updates the latest row in place and resets review status", async () => {
    if (!database || !schema || !playerImport)
      throw new Error("Database integration test dependencies are unavailable");

    await database.db.insert(schema.players).values({
      id: playerId,
      canonicalName: "BeforeUpdate",
    });
    await database.db.insert(schema.playerSnapshots).values({
      id: snapshotId,
      playerId,
      dataVersion: 3,
      countryCode: "CN",
      countryGroupCode: "east_asia",
      region: "china",
      primaryRole: "duelist",
      currentOrLastTeam: "Before Team",
      isActiveRoster: true,
      championsTitles: 0,
      mastersTitles: 0,
      leagueTitles: 0,
      dataAsOf: new Date("2026-08-01T00:00:00.000Z"),
      sourceUrl: "https://example.test/before",
      sourceCheckedAt: new Date("2026-08-01T00:00:00.000Z"),
      reviewStatus: "approved",
    });

    const result = await playerImport.updateLatestPlayerSnapshot(playerId, {
      canonicalName: "AfterUpdate",
      aliases: ["after-update"],
      countryCode: "CN",
      countryGroup: "east_asia",
      region: "china",
      primaryRole: "controller",
      currentOrLastTeam: "After Team",
      rosterStatus: "active",
      isActiveRoster: true,
      isCoach: false,
      isFeaturedTeam: false,
      isVctCnTeam: true,
      championsTitles: 1,
      mastersTitles: 2,
      leagueTitles: 3,
      dataAsOf: "2026-08-22",
      sourceUrl: "https://example.test/after",
      sourceCheckedAt: "2026-08-22T00:00:00.000Z",
      reviewStatus: "pending_review",
    });

    expect(result).toEqual({ playerId, snapshotId });
    const [updatedPlayer] = await database.db
      .select()
      .from(schema.players)
      .where(eq(schema.players.id, playerId));
    const [updatedSnapshot] = await database.db
      .select()
      .from(schema.playerSnapshots)
      .where(eq(schema.playerSnapshots.id, snapshotId));

    expect(updatedPlayer.canonicalName).toBe("AfterUpdate");
    expect(updatedSnapshot.dataVersion).toBe(3);
    expect(updatedSnapshot.currentOrLastTeam).toBe("After Team");
    expect(updatedSnapshot.reviewStatus).toBe("pending_review");
    expect(updatedSnapshot.isVctCnTeam).toBe(true);
  });
});
