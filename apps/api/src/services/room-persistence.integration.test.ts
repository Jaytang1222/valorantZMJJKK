import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  beginCountdown,
  beginRound,
  createLiveRoom,
  joinRoom,
  setReady,
  surrenderMember,
} from "./room-state.js";

const databaseTestsEnabled = process.env.RUN_DATABASE_TESTS === "true";
const testSuite = databaseTestsEnabled ? describe : describe.skip;
const database = databaseTestsEnabled
  ? await import("../db/client.js")
  : undefined;
const schema = databaseTestsEnabled
  ? await import("../db/schema.js")
  : undefined;
const roomStore = databaseTestsEnabled
  ? await import("./room-store.js")
  : undefined;
const leaderboard = databaseTestsEnabled
  ? await import("./leaderboard.js")
  : undefined;
const application = databaseTestsEnabled
  ? await import("../app.js")
  : undefined;
const cache = databaseTestsEnabled ? await import("../redis.js") : undefined;

testSuite("finished room persistence", () => {
  const hostId = randomUUID();
  const guestId = randomUUID();
  const playerId = randomUUID();
  const snapshotId = randomUUID();
  const puzzleId = randomUUID();
  const roomId = randomUUID();
  const code = `T${randomUUID().replaceAll("-", "").slice(0, 5)}`.toUpperCase();

  afterAll(async () => {
    if (!database || !schema) return;
    await database.db.delete(schema.rooms).where(
      // The fixture owns its room and the related rows cascade from it.
      eq(schema.rooms.id, roomId),
    );
    await database.db
      .delete(schema.puzzles)
      .where(eq(schema.puzzles.id, puzzleId));
    await database.db
      .delete(schema.playerSnapshots)
      .where(eq(schema.playerSnapshots.id, snapshotId));
    await database.db
      .delete(schema.players)
      .where(eq(schema.players.id, playerId));
    await database.db
      .delete(schema.users)
      .where(inArray(schema.users.id, [hostId, guestId]));
    await cache?.closeRedis();
    await database.closeDatabase();
  });

  it("keeps a surrendered match in both players' history after Redis cleanup", async () => {
    if (!database || !schema || !roomStore || !leaderboard)
      throw new Error("Database integration test dependencies are unavailable");
    const now = Date.now();
    await database.db.insert(schema.users).values([
      {
        id: hostId,
        displayName: `Host${hostId.slice(0, 6)}`,
        normalizedDisplayName: `host${hostId.slice(0, 6)}`,
      },
      {
        id: guestId,
        displayName: `Guest${guestId.slice(0, 6)}`,
        normalizedDisplayName: `guest${guestId.slice(0, 6)}`,
      },
    ]);
    await database.db.insert(schema.players).values({
      id: playerId,
      canonicalName: `Target${playerId.slice(0, 6)}`,
    });
    await database.db.insert(schema.playerSnapshots).values({
      id: snapshotId,
      playerId,
      dataVersion: 1,
      countryCode: "CN",
      countryGroupCode: "east_asia",
      region: "china",
      primaryRole: "duelist",
      currentOrLastTeam: "Test Team",
      championsTitles: 0,
      mastersTitles: 0,
      heroTop3: ["Jett", "Raze", "Neon"],
      dataAsOf: new Date(now),
      sourceUrl: "https://example.test/source",
      sourceCheckedAt: new Date(now),
      reviewStatus: "approved",
    });
    await database.db.insert(schema.puzzles).values({
      id: puzzleId,
      snapshotId,
      difficulty: "full",
      status: "approved",
    });

    const room = createLiveRoom({
      id: roomId,
      code,
      hostId,
      isPublic: false,
      isMatchmade: true,
      maxPlayers: 2,
      roundCount: 1,
      roundDurationSeconds: 300,
      host: {
        userId: hostId,
        displayName: "Host",
        status: "connected",
        ready: false,
        score: 0,
        guessCount: 0,
        joinedAt: now,
      },
    });
    joinRoom(room, {
      userId: guestId,
      displayName: "Guest",
      status: "connected",
      ready: false,
      score: 0,
      guessCount: 0,
      joinedAt: now,
    });
    setReady(room, hostId, true);
    setReady(room, guestId, true);
    beginCountdown(room, hostId);
    beginRound(room, now);
    room.targetPlayerId = playerId;
    room.targetPuzzleId = puzzleId;
    surrenderMember(room, hostId);

    await roomStore.saveRoom(room);
    await roomStore.archiveFinishedRoom(room);

    const [persisted] = await database.db
      .select({
        state: schema.rooms.state,
        winnerUserId: schema.rooms.winnerUserId,
        finishReason: schema.rooms.finishReason,
        finishedAt: schema.rooms.finishedAt,
      })
      .from(schema.rooms)
      .where(eq(schema.rooms.id, roomId));
    expect(persisted).toMatchObject({
      state: "finished",
      winnerUserId: guestId,
      finishReason: "surrender",
    });
    expect(persisted?.finishedAt).not.toBeNull();

    const [hostSummary, guestSummary] = await Promise.all([
      leaderboard.getAccountSummary(hostId),
      leaderboard.getAccountSummary(guestId),
    ]);
    expect(hostSummary.versus).toMatchObject({
      gamesPlayed: 1,
      wins: 0,
      winRate: 0,
    });
    expect(guestSummary.versus).toMatchObject({
      gamesPlayed: 1,
      wins: 1,
      winRate: 1,
    });
    expect(hostSummary.recentGames.some((game) => game.id === roomId)).toBe(
      true,
    );
    expect(guestSummary.recentGames.some((game) => game.id === roomId)).toBe(
      true,
    );
  });

  it("enforces authentication, internal-secret, validation, and login limits", async () => {
    if (!application)
      throw new Error(
        "Application integration test dependencies are unavailable",
      );
    const app = await application.buildApp();
    await app.ready();
    try {
      const deniedAdmin = await app.inject({
        method: "GET",
        url: "/internal/v1/admin/snapshots",
      });
      expect(deniedAdmin.statusCode).toBe(401);

      const deniedProfile = await app.inject({
        method: "GET",
        url: `/v1/profiles/${guestId}/versus`,
      });
      expect(deniedProfile.statusCode).toBe(401);

      const invalidLogin = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: "invalid", password: "short" },
      });
      expect(invalidLogin.statusCode).toBe(400);
      expect(invalidLogin.json()).toEqual({ error: "Invalid request" });

      for (let attempt = 0; attempt < 9; attempt += 1) {
        const response = await app.inject({
          method: "POST",
          url: "/v1/auth/login",
          payload: {
            email: `missing-${attempt}@example.test`,
            password: "valid-password",
          },
        });
        expect(response.statusCode).toBe(401);
      }
      const throttledLogin = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          email: "missing-final@example.test",
          password: "valid-password",
        },
      });
      expect(throttledLogin.statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
});
