import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  beginCountdown,
  beginRound,
  createLiveRoom,
  disconnectMember,
  forfeitExpiredMembers,
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
      isActiveRoster: true,
      championsTitles: 0,
      mastersTitles: 0,
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

    await roomStore.saveRoom(room);
    await cache?.redis.del(`valo:room:${code}`);
    const restored = await roomStore.loadRoom(code);
    expect(restored).toMatchObject({
      id: roomId,
      phase: "playing",
      targetPlayerId: playerId,
      targetPuzzleId: puzzleId,
    });
    surrenderMember(restored!, hostId);
    await roomStore.saveRoom(restored!);
    await roomStore.archiveFinishedRoom(restored!);

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

  it("persists a disconnect timeout winner and keeps both histories after cleanup", async () => {
    if (!database || !schema || !roomStore || !leaderboard || !cache)
      throw new Error("Database integration test dependencies are unavailable");
    const timeoutHostId = randomUUID();
    const timeoutGuestId = randomUUID();
    const timeoutPlayerId = randomUUID();
    const timeoutSnapshotId = randomUUID();
    const timeoutPuzzleId = randomUUID();
    const timeoutRoomId = randomUUID();
    const timeoutCode =
      `D${randomUUID().replaceAll("-", "").slice(0, 5)}`.toUpperCase();
    const now = Date.now();
    try {
      await database.db.insert(schema.users).values([
        {
          id: timeoutHostId,
          displayName: `TimeoutHost${timeoutHostId.slice(0, 6)}`,
          normalizedDisplayName: `timeouthost${timeoutHostId.slice(0, 6)}`,
        },
        {
          id: timeoutGuestId,
          displayName: `TimeoutGuest${timeoutGuestId.slice(0, 6)}`,
          normalizedDisplayName: `timeoutguest${timeoutGuestId.slice(0, 6)}`,
        },
      ]);
      await database.db.insert(schema.players).values({
        id: timeoutPlayerId,
        canonicalName: `TimeoutTarget${timeoutPlayerId.slice(0, 6)}`,
      });
      await database.db.insert(schema.playerSnapshots).values({
        id: timeoutSnapshotId,
        playerId: timeoutPlayerId,
        dataVersion: 1,
        countryCode: "CN",
        countryGroupCode: "east_asia",
        region: "china",
        primaryRole: "duelist",
        currentOrLastTeam: "Test Team",
        isActiveRoster: true,
        championsTitles: 0,
        mastersTitles: 0,
        leagueTitles: 0,
        dataAsOf: new Date(now),
        sourceUrl: "https://example.test/source",
        sourceCheckedAt: new Date(now),
        reviewStatus: "approved",
      });
      await database.db.insert(schema.puzzles).values({
        id: timeoutPuzzleId,
        snapshotId: timeoutSnapshotId,
        difficulty: "full",
        status: "approved",
      });

      const room = createLiveRoom({
        id: timeoutRoomId,
        code: timeoutCode,
        hostId: timeoutHostId,
        isPublic: false,
        isMatchmade: true,
        maxPlayers: 2,
        roundCount: 1,
        roundDurationSeconds: 300,
        host: {
          userId: timeoutHostId,
          displayName: "Timeout Host",
          status: "connected",
          ready: false,
          score: 0,
          guessCount: 0,
          joinedAt: now,
        },
      });
      joinRoom(room, {
        userId: timeoutGuestId,
        displayName: "Timeout Guest",
        status: "connected",
        ready: false,
        score: 0,
        guessCount: 0,
        joinedAt: now,
      });
      setReady(room, timeoutHostId, true);
      setReady(room, timeoutGuestId, true);
      beginCountdown(room, timeoutHostId);
      beginRound(room, now);
      room.targetPlayerId = timeoutPlayerId;
      room.targetPuzzleId = timeoutPuzzleId;
      await roomStore.saveRoom(room);
      disconnectMember(room, timeoutHostId, now);
      await roomStore.saveRoom(room);

      const restored = await roomStore.loadRoom(timeoutCode);
      expect(restored?.members[0].status).toBe("disconnected");
      forfeitExpiredMembers(restored!, now + 20_000);
      await roomStore.saveRoom(restored!);
      await roomStore.saveRoom(restored!);
      await roomStore.archiveFinishedRoom(restored!);

      const [persisted] = await database.db
        .select({
          state: schema.rooms.state,
          winnerUserId: schema.rooms.winnerUserId,
          finishReason: schema.rooms.finishReason,
          finishedAt: schema.rooms.finishedAt,
        })
        .from(schema.rooms)
        .where(eq(schema.rooms.id, timeoutRoomId));
      expect(persisted).toMatchObject({
        state: "finished",
        winnerUserId: timeoutGuestId,
        finishReason: "disconnect",
      });
      expect(persisted?.finishedAt).not.toBeNull();

      const [hostSummary, guestSummary] = await Promise.all([
        leaderboard.getAccountSummary(timeoutHostId),
        leaderboard.getAccountSummary(timeoutGuestId),
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
      expect(
        hostSummary.recentGames.some((game) => game.id === timeoutRoomId),
      ).toBe(true);
      expect(
        guestSummary.recentGames.some((game) => game.id === timeoutRoomId),
      ).toBe(true);
    } finally {
      await database.db
        .delete(schema.rooms)
        .where(eq(schema.rooms.id, timeoutRoomId));
      await database.db
        .delete(schema.puzzles)
        .where(eq(schema.puzzles.id, timeoutPuzzleId));
      await database.db
        .delete(schema.playerSnapshots)
        .where(eq(schema.playerSnapshots.id, timeoutSnapshotId));
      await database.db
        .delete(schema.players)
        .where(eq(schema.players.id, timeoutPlayerId));
      await database.db
        .delete(schema.users)
        .where(inArray(schema.users.id, [timeoutHostId, timeoutGuestId]));
      await cache.redis.del(`valo:room:${timeoutCode}`);
    }
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

      const pagedAdmin = await app.inject({
        method: "GET",
        url: "/internal/v1/admin/snapshots?reviewStatus=all&page=1&limit=1",
        headers: { "x-internal-api-secret": process.env.INTERNAL_API_SECRET },
      });
      expect(pagedAdmin.statusCode).toBe(200);
      expect(pagedAdmin.json()).toMatchObject({
        page: 1,
        limit: 1,
        totalPages: expect.any(Number),
        items: expect.any(Array),
      });

      const adminHeaders = {
        "x-internal-api-secret": process.env.INTERNAL_API_SECRET,
      };
      const createdUserResponse = await app.inject({
        method: "POST",
        url: "/internal/v1/admin/users",
        headers: adminHeaders,
        payload: {
          email: `admin-created-${guestId}@example.test`,
          password: "temporary-password",
        },
      });
      expect(createdUserResponse.statusCode).toBe(201);
      const createdUser = createdUserResponse.json() as { id: string };
      const userListResponse = await app.inject({
        method: "GET",
        url: "/internal/v1/admin/users?limit=1",
        headers: adminHeaders,
      });
      expect(userListResponse.statusCode).toBe(200);
      expect(userListResponse.json().items[0]).toMatchObject({
        stats: { solo: null, versus: null },
      });
      const resetResponse = await app.inject({
        method: "POST",
        url: `/internal/v1/admin/users/${createdUser.id}/password-reset`,
        headers: adminHeaders,
      });
      expect(resetResponse.statusCode).toBe(200);
      expect(resetResponse.json()).toMatchObject({
        id: createdUser.id,
        temporaryPassword: "123456",
      });
      const resetLogin = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          email: `admin-created-${guestId}@example.test`,
          password: "123456",
        },
      });
      expect(resetLogin.statusCode).toBe(200);
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/internal/v1/admin/users/${createdUser.id}`,
        headers: adminHeaders,
      });
      expect(deleteResponse.statusCode).toBe(200);
      if (database && schema)
        await database.db
          .delete(schema.users)
          .where(eq(schema.users.id, createdUser.id));

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

      // The malformed request above also consumes one login-limit slot.
      for (let attempt = 0; attempt < 8; attempt += 1) {
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
  }, 20_000);

  it("anonymizes users with historical matches and preserves records", async () => {
    if (!database || !schema || !application)
      throw new Error("Database integration test dependencies are unavailable");
    const app = await application.buildApp();
    await app.ready();
    const userId = randomUUID();
    const playerId = randomUUID();
    const snapshotId = randomUUID();
    const puzzleId = randomUUID();
    const roomId = randomUUID();
    const email = `anonymize-${userId}@example.test`;
    const now = new Date();
    let createdUserId: string | undefined;
    let replacementId: string | undefined;
    const adminHeaders = {
      "x-internal-api-secret": process.env.INTERNAL_API_SECRET,
    };
    try {
      const created = await app.inject({
        method: "POST",
        url: "/internal/v1/admin/users",
        headers: adminHeaders,
        payload: {
          email,
          password: "temporary-password",
          role: "admin",
        },
      });
      expect(created.statusCode).toBe(201);
      const createdUser = created.json() as { id: string };
      createdUserId = createdUser.id;
      const authenticated = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email, password: "temporary-password" },
      });
      expect(authenticated.statusCode).toBe(200);
      const session = authenticated.json().session.token as string;
      const sessionBeforeDeletion = await app.inject({
        method: "GET",
        url: "/v1/auth/me",
        headers: { authorization: `Bearer ${session}` },
      });
      expect(sessionBeforeDeletion.statusCode).toBe(200);
      await database.db.insert(schema.players).values({
        id: playerId,
        canonicalName: `Anonymize Target ${playerId.slice(0, 6)}`,
      });
      await database.db.insert(schema.playerSnapshots).values({
        id: snapshotId,
        playerId,
        dataVersion: 1,
        countryCode: "CN",
        countryGroupCode: "east_asia",
        age: 20,
        region: "china",
        primaryRole: "flex",
        playerRoles: ["flex"],
        currentOrLastTeam: "Test Team",
        dataAsOf: now,
        sourceUrl: "https://example.test/anonymize",
        sourceCheckedAt: now,
        reviewStatus: "approved",
      });
      await database.db.insert(schema.puzzles).values({
        id: puzzleId,
        snapshotId,
        difficulty: "full",
        status: "approved",
      });
      await database.db.insert(schema.rooms).values({
        id: roomId,
        code: `A${userId.replaceAll("-", "").slice(0, 5)}`,
        hostId: createdUser.id,
        state: "finished",
        rankedEligible: true,
        finishedAt: now,
        winnerUserId: createdUser.id,
      });
      await database.db.insert(schema.roomParticipants).values({
        roomId,
        userId: createdUser.id,
        state: "connected",
        score: 1,
      });

      const deleted = await app.inject({
        method: "DELETE",
        url: `/internal/v1/admin/users/${createdUser.id}`,
        headers: adminHeaders,
      });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toMatchObject({ id: createdUser.id });

      const [stored] = await database.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, createdUser.id));
      expect(stored).toMatchObject({
        email: null,
        normalizedEmail: null,
        passwordHash: null,
        role: "user",
      });
      expect(stored?.deletedAt).toBeInstanceOf(Date);
      const sessionUser = await app.inject({
        method: "GET",
        url: "/v1/auth/me",
        headers: { authorization: `Bearer ${session}` },
      });
      expect(sessionUser.statusCode).toBe(200);
      expect(sessionUser.json()).toMatchObject({
        user: {
          id: createdUser.id,
          displayName: "已注销用户",
          email: null,
          role: "user",
        },
      });
      const [storedRoom] = await database.db
        .select({ id: schema.rooms.id, hostId: schema.rooms.hostId })
        .from(schema.rooms)
        .where(eq(schema.rooms.id, roomId));
      const [storedParticipant] = await database.db
        .select({ userId: schema.roomParticipants.userId })
        .from(schema.roomParticipants)
        .where(eq(schema.roomParticipants.roomId, roomId));
      expect(storedRoom).toMatchObject({ id: roomId, hostId: createdUser.id });
      expect(storedParticipant?.userId).toBe(createdUser.id);

      const login = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email, password: "temporary-password" },
      });
      expect(login.statusCode).toBe(401);

      const activeUsers = await app.inject({
        method: "GET",
        url: "/internal/v1/admin/users?view=active&limit=100",
        headers: adminHeaders,
      });
      expect(
        activeUsers
          .json()
          .items.some((item: { id: string }) => item.id === createdUser.id),
      ).toBe(false);
      const deletedUsers = await app.inject({
        method: "GET",
        url: "/internal/v1/admin/users?view=deleted&limit=100",
        headers: adminHeaders,
      });
      expect(deletedUsers.json().items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: createdUser.id,
            displayName: "已注销用户",
            deletedAt: expect.any(String),
          }),
        ]),
      );

      const repeated = await app.inject({
        method: "DELETE",
        url: `/internal/v1/admin/users/${createdUser.id}`,
        headers: adminHeaders,
      });
      expect(repeated.statusCode).toBe(200);
      const resetDeleted = await app.inject({
        method: "POST",
        url: `/internal/v1/admin/users/${createdUser.id}/password-reset`,
        headers: adminHeaders,
      });
      expect(resetDeleted.statusCode).toBe(409);
      const reRegistered = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { email, password: "replacement-password" },
      });
      expect(reRegistered.statusCode).toBe(201);
      const replacement = reRegistered.json() as { user: { id: string } };
      replacementId = replacement.user.id;
    } finally {
      await database.db.delete(schema.rooms).where(eq(schema.rooms.id, roomId));
      await database.db
        .delete(schema.puzzles)
        .where(eq(schema.puzzles.id, puzzleId));
      await database.db
        .delete(schema.playerSnapshots)
        .where(eq(schema.playerSnapshots.id, snapshotId));
      await database.db
        .delete(schema.players)
        .where(eq(schema.players.id, playerId));
      if (createdUserId)
        await database.db
          .delete(schema.users)
          .where(eq(schema.users.id, createdUserId));
      if (replacementId)
        await database.db
          .delete(schema.users)
          .where(eq(schema.users.id, replacementId));
      await app.close();
    }
  });
});
