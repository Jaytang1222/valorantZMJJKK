import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseTestsEnabled = process.env.RUN_DATABASE_TESTS === "true";
const testSuite = databaseTestsEnabled ? describe : describe.skip;
const database = databaseTestsEnabled
  ? await import("../db/client.js")
  : undefined;
const schema = databaseTestsEnabled
  ? await import("../db/schema.js")
  : undefined;
const application = databaseTestsEnabled
  ? await import("../app.js")
  : undefined;

testSuite("player age in solo guess payloads", () => {
  const targetPlayerId = randomUUID();
  const guessedPlayerId = randomUUID();
  const targetSnapshotId = randomUUID();
  const guessedSnapshotId = randomUUID();
  const puzzleId = randomUUID();
  const attemptId = randomUUID();
  const guestId = randomUUID();
  let app: Awaited<ReturnType<NonNullable<typeof application>["buildApp"]>>;

  beforeAll(async () => {
    if (!database || !schema || !application)
      throw new Error("Database integration test dependencies are unavailable");

    const now = new Date();
    await database.db.insert(schema.players).values([
      { id: targetPlayerId, canonicalName: `Age Target ${targetPlayerId}` },
      { id: guessedPlayerId, canonicalName: `Age Guess ${guessedPlayerId}` },
    ]);
    await database.db.insert(schema.playerSnapshots).values([
      {
        id: targetSnapshotId,
        playerId: targetPlayerId,
        dataVersion: 1,
        countryCode: "CN",
        countryGroupCode: "east_asia",
        age: 24,
        region: "china",
        primaryRole: "duelist",
        playerRoles: ["duelist"],
        currentOrLastTeam: "Target Team",
        isActiveRoster: true,
        championsTitles: 1,
        mastersTitles: 2,
        leagueTitles: 3,
        dataAsOf: now,
        sourceUrl: "https://example.test/age-target",
        sourceCheckedAt: now,
        reviewStatus: "approved",
      },
      {
        id: guessedSnapshotId,
        playerId: guessedPlayerId,
        dataVersion: 1,
        countryCode: "JP",
        countryGroupCode: "east_asia",
        age: 20,
        region: "pacific",
        primaryRole: "initiator",
        playerRoles: ["initiator", "flex"],
        currentOrLastTeam: "Guess Team",
        isActiveRoster: true,
        championsTitles: 0,
        mastersTitles: 1,
        leagueTitles: 1,
        dataAsOf: now,
        sourceUrl: "https://example.test/age-guess",
        sourceCheckedAt: now,
        reviewStatus: "approved",
      },
    ]);
    await database.db.insert(schema.puzzles).values({
      id: puzzleId,
      snapshotId: targetSnapshotId,
      difficulty: "full",
      status: "approved",
    });
    await database.db.insert(schema.soloAttempts).values({
      id: attemptId,
      puzzleId,
      difficulty: "full",
      guestId,
    });
    app = await application.buildApp();
  });

  afterAll(async () => {
    if (!database || !schema) return;
    await app?.close();
    await database.db
      .delete(schema.soloAttempts)
      .where(eq(schema.soloAttempts.id, attemptId));
    await database.db
      .delete(schema.puzzles)
      .where(eq(schema.puzzles.id, puzzleId));
    await database.db
      .delete(schema.playerSnapshots)
      .where(
        inArray(schema.playerSnapshots.id, [
          targetSnapshotId,
          guessedSnapshotId,
        ]),
      );
    await database.db
      .delete(schema.players)
      .where(inArray(schema.players.id, [targetPlayerId, guessedPlayerId]));
    await database.closeDatabase();
  });

  it("returns age and its numeric comparison in new and restored solo guesses", async () => {
    const guessResponse = await app.inject({
      method: "POST",
      url: `/v1/solo/attempts/${attemptId}/guesses`,
      payload: { playerId: guessedPlayerId, guestId },
    });

    expect(guessResponse.statusCode).toBe(200);
    expect(guessResponse.json()).toMatchObject({
      guess: {
        playerId: guessedPlayerId,
        comparison: { age: "higher" },
        details: { age: 20 },
      },
    });

    const restored = await app.inject({
      url: `/v1/solo/attempts/${attemptId}?guestId=${guestId}`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().guesses).toMatchObject([
      {
        comparison: { age: "higher" },
        details: { age: 20 },
      },
    ]);
  });
});
