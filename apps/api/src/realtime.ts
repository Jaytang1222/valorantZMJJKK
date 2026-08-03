import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import { env } from "./config.js";
import { verifyRealtimeTicket } from "./routes/auth.js";
import { redis, redisSubscriber } from "./redis.js";
import { db } from "./db/client.js";
import { playerSnapshots, players, puzzles, users } from "./db/schema.js";
import { and, eq, sql } from "drizzle-orm";
import {
  beginCountdown,
  beginRound,
  cancelRoom,
  createInviteCode,
  createLiveRoom,
  disconnectMember,
  finishRound,
  forfeitExpiredMembers,
  hasActiveMembership,
  joinRoom,
  leaveRoom,
  recordGuess,
  setReady,
  surrenderMember,
  voteRematch,
  type LiveRoom,
} from "./services/room-state.js";
import {
  acquireMatchLock,
  acquireRoomLock,
  archiveFinishedRoom,
  cancelMatch,
  deleteRoom,
  enqueueMatch,
  loadRoom,
  saveRoom,
  takeMatchOpponent,
  type QueueEntry,
} from "./services/room-store.js";
import { compareSoloGuess } from "./lib/solo-comparison.js";
import { findVersusEligibleSnapshot } from "./services/puzzle-selection.js";

const FINISHED_ROOM_TTL_MS = 120_000;

export function createRealtimeServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN ?? false, credentials: true },
    transports: ["websocket", "polling"],
  });

  io.adapter(createAdapter(redis, redisSubscriber));
  io.use((socket, next) => {
    const userId = verifyRealtimeTicket(socket.handshake.auth.ticket);
    if (!userId) return next(new Error("Authentication is required"));
    socket.data.userId = userId;
    return next();
  });

  const publicRoom = (room: LiveRoom) => {
    const {
      targetPlayerId: _targetPlayerId,
      targetPuzzleId: _targetPuzzleId,
      ...safe
    } = room;
    if (room.phase === "playing") {
      const { answerName: _answerName, ...duringRound } = safe;
      return {
        ...duringRound,
        members: room.members.map(({ guesses: _guesses, ...member }) => member),
      };
    }
    return {
      ...safe,
      members: room.members.map(({ guesses: _guesses, ...member }) => member),
    };
  };
  const ownGuesses = (room: LiveRoom, userId: string) =>
    room.members.find((member) => member.userId === userId)?.guesses ?? [];
  const emitRoom = (room: LiveRoom) =>
    io.to(`room:${room.code}`).emit("room:state", publicRoom(room));
  const emitClosed = (room: LiveRoom) =>
    io.to(`room:${room.code}`).emit("room:closed", { code: room.code });

  const answerNameFor = async (room: LiveRoom) => {
    if (room.answerName || !room.targetPlayerId) return room.answerName;
    const [target] = await db
      .select({ canonicalName: players.canonicalName })
      .from(players)
      .where(eq(players.id, room.targetPlayerId))
      .limit(1);
    room.answerName = target?.canonicalName;
    return room.answerName;
  };

  const emitFinishedRoom = async (room: LiveRoom) => {
    const answerName = await answerNameFor(room);
    await saveRoom(room);
    emitRoom(room);
    if (answerName)
      io.to(`room:${room.code}`).emit("room:round-result", {
        room: publicRoom(room),
        target: { canonicalName: answerName },
      });
    scheduleFinishedRoomCleanup(room.code);
  };

  const disposeIfEmpty = async (room: LiveRoom) => {
    if (hasActiveMembership(room)) return false;
    if (room.phase === "finished") {
      emitClosed(room);
      await archiveFinishedRoom(room);
      return true;
    }
    cancelRoom(room);
    await saveRoom(room);
    emitClosed(room);
    await deleteRoom(room.code);
    return true;
  };

  const scheduleFinishedRoomCleanup = (code: string) => {
    setTimeout(async () => {
      let release: (() => Promise<void>) | undefined;
      try {
        release = await acquireRoomLock(code);
        const room = await loadRoom(code);
        if (!room || room.phase !== "finished") return;
        emitClosed(room);
        await archiveFinishedRoom(room);
      } finally {
        await release?.();
      }
    }, FINISHED_ROOM_TTL_MS).unref();
  };

  const scheduleRoundTimeout = (code: string, endsAt: number) => {
    setTimeout(
      async () => {
        let release: (() => Promise<void>) | undefined;
        try {
          release = await acquireRoomLock(code);
          const room = await loadRoom(code);
          if (!room || room.phase !== "playing" || room.roundEndsAt !== endsAt)
            return;
          finishRound(room, "time_expired");
          await emitFinishedRoom(room);
        } finally {
          await release?.();
        }
      },
      Math.max(0, endsAt - Date.now()),
    ).unref();
  };

  const scheduleReconnectExpiry = (code: string) => {
    setTimeout(async () => {
      let release: (() => Promise<void>) | undefined;
      try {
        release = await acquireRoomLock(code);
        const room = await loadRoom(code);
        if (!room) return;
        const previousPhase = room.phase;
        forfeitExpiredMembers(room);
        if (room.phase === "finished" && previousPhase !== "finished") {
          await emitFinishedRoom(room);
          return;
        }
        if (await disposeIfEmpty(room)) return;
        await saveRoom(room);
        emitRoom(room);
      } finally {
        await release?.();
      }
    }, 20_100).unref();
  };

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    const getUser = async () => {
      const [user] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) throw new Error("User not found");
      return user;
    };
    const pickTarget = async () => {
      const target = await findVersusEligibleSnapshot();
      if (!target) throw new Error("No approved puzzle is available");
      let [puzzle] = await db
        .select({ id: puzzles.id })
        .from(puzzles)
        .where(
          and(
            eq(puzzles.snapshotId, target.snapshotId),
            eq(puzzles.status, "approved"),
          ),
        )
        .limit(1);
      if (!puzzle)
        [puzzle] = await db
          .insert(puzzles)
          .values({
            snapshotId: target.snapshotId,
            difficulty: target.difficulty,
            status: "approved",
          })
          .returning({ id: puzzles.id });
      return { playerId: target.playerId, puzzleId: puzzle.id };
    };
    const reconnect = async (code: string) => {
      const room = await loadRoom(code);
      if (!room) throw new Error("Room not found");
      const user = await getUser();
      joinRoom(room, {
        userId,
        displayName: user.displayName,
        status: "connected",
        ready: false,
        score: 0,
        guessCount: 0,
        joinedAt: Date.now(),
      });
      await saveRoom(room);
      await socket.join(`room:${room.code}`);
      emitRoom(room);
      return room;
    };

    socket.on("room:create", async (input, acknowledge) => {
      try {
        const user = await getUser();
        let code = createInviteCode();
        while (await loadRoom(code)) code = createInviteCode();
        const room = createLiveRoom({
          id: randomUUID(),
          code,
          hostId: userId,
          isPublic: false,
          isMatchmade: false,
          maxPlayers: Number(input?.maxPlayers ?? 2),
          roundCount: Number(input?.roundCount ?? 1),
          roundDurationSeconds: Number(input?.roundDurationSeconds ?? 300),
          host: {
            userId,
            displayName: user.displayName,
            status: "connected",
            ready: false,
            score: 0,
            guessCount: 0,
            joinedAt: Date.now(),
          },
        });
        await saveRoom(room);
        await socket.join(`room:${code}`);
        acknowledge?.({
          room: publicRoom(room),
          ownGuesses: ownGuesses(room, userId),
        });
      } catch (error) {
        acknowledge?.({
          error:
            error instanceof Error ? error.message : "Unable to create room",
        });
      }
    });

    socket.on("match:join", async (input, acknowledge) => {
      let release: (() => Promise<void>) | undefined;
      try {
        const maxPlayers = Number(input?.maxPlayers ?? 2);
        const roundCount = Number(input?.roundCount ?? 1);
        const roundDurationSeconds = Number(input?.roundDurationSeconds ?? 300);
        if (maxPlayers !== 2 || roundCount !== 1)
          throw new Error("Matchmaking supports two-player BO1 only");
        if (roundDurationSeconds !== 300)
          throw new Error("Round duration is unavailable");
        const settings = `${maxPlayers}:${roundCount}:${roundDurationSeconds}`;
        const user = await getUser();
        release = await acquireMatchLock(settings);
        await cancelMatch(settings, userId);
        let opponent: QueueEntry | null = null;
        for (let attempt = 0; attempt < 16; attempt += 1) {
          const candidate = await takeMatchOpponent(settings, userId);
          if (!candidate) break;
          const candidateSockets = await io
            .in(candidate.socketId)
            .fetchSockets();
          if (
            candidateSockets.some(
              (candidateSocket) =>
                candidateSocket.data.userId === candidate.userId,
            )
          ) {
            opponent = candidate;
            break;
          }
        }
        if (!opponent) {
          await enqueueMatch(settings, {
            userId,
            displayName: user.displayName,
            socketId: socket.id,
            joinedAt: Date.now(),
          });
          acknowledge?.({ waiting: true });
          return;
        }
        let code = createInviteCode();
        while (await loadRoom(code)) code = createInviteCode();
        const room = createLiveRoom({
          id: randomUUID(),
          code,
          hostId: opponent.userId,
          isPublic: false,
          isMatchmade: true,
          maxPlayers,
          roundCount,
          roundDurationSeconds,
          host: {
            userId: opponent.userId,
            displayName: opponent.displayName,
            status: "connected",
            ready: false,
            score: 0,
            guessCount: 0,
            joinedAt: opponent.joinedAt,
          },
        });
        joinRoom(room, {
          userId,
          displayName: user.displayName,
          status: "connected",
          ready: false,
          score: 0,
          guessCount: 0,
          joinedAt: Date.now(),
        });
        await saveRoom(room);
        await io.in([socket.id, opponent.socketId]).socketsJoin(`room:${code}`);
        io.to(opponent.socketId).emit("match:found", {
          room: publicRoom(room),
        });
        acknowledge?.({
          room: publicRoom(room),
          ownGuesses: ownGuesses(room, userId),
        });
        emitRoom(room);
      } catch (error) {
        acknowledge?.({
          error:
            error instanceof Error
              ? error.message
              : "Unable to join matchmaking",
        });
      } finally {
        await release?.();
      }
    });

    socket.on("match:cancel", async (input, acknowledge) => {
      let release: (() => Promise<void>) | undefined;
      try {
        const maxPlayers = Number(input?.maxPlayers ?? 2);
        const roundCount = Number(input?.roundCount ?? 1);
        const roundDurationSeconds = Number(input?.roundDurationSeconds ?? 300);
        if (
          maxPlayers !== 2 ||
          roundCount !== 1 ||
          roundDurationSeconds !== 300
        )
          throw new Error("Matchmaking settings are unavailable");
        const settings = `${maxPlayers}:${roundCount}:${roundDurationSeconds}`;
        release = await acquireMatchLock(settings);
        await cancelMatch(settings, userId);
        acknowledge?.({ ok: true });
      } catch (error) {
        acknowledge?.({
          error:
            error instanceof Error
              ? error.message
              : "Unable to cancel matchmaking",
        });
      } finally {
        await release?.();
      }
    });

    socket.on("room:join", async ({ code }, acknowledge) => {
      let release: (() => Promise<void>) | undefined;
      try {
        const roomCode = String(code).toUpperCase();
        release = await acquireRoomLock(roomCode);
        const room = await reconnect(roomCode);
        acknowledge?.({
          room: publicRoom(room),
          ownGuesses: ownGuesses(room, userId),
        });
      } catch (error) {
        acknowledge?.({
          error: error instanceof Error ? error.message : "Unable to join room",
        });
      } finally {
        await release?.();
      }
    });

    socket.on("room:ready", async ({ code, ready }, acknowledge) => {
      let release: (() => Promise<void>) | undefined;
      try {
        const roomCode = String(code);
        release = await acquireRoomLock(roomCode);
        const room = await loadRoom(roomCode);
        if (!room) throw new Error("Room not found");
        setReady(room, userId, Boolean(ready));
        await saveRoom(room);
        emitRoom(room);
        acknowledge?.({ room: publicRoom(room) });
      } catch (error) {
        acknowledge?.({
          error:
            error instanceof Error
              ? error.message
              : "Unable to update ready state",
        });
      } finally {
        await release?.();
      }
    });

    socket.on("room:start", async ({ code }, acknowledge) => {
      let release: (() => Promise<void>) | undefined;
      try {
        const roomCode = String(code);
        release = await acquireRoomLock(roomCode);
        const room = await loadRoom(roomCode);
        if (!room) throw new Error("Room not found");
        beginCountdown(room, userId);
        const target = await pickTarget();
        beginRound(room);
        room.targetPlayerId = target.playerId;
        room.targetPuzzleId = target.puzzleId;
        await saveRoom(room);
        scheduleRoundTimeout(room.code, room.roundEndsAt!);
        emitRoom(room);
        io.to(`room:${room.code}`).emit("room:match-started", {
          code: room.code,
        });
        acknowledge?.({ room: publicRoom(room) });
      } catch (error) {
        acknowledge?.({
          error:
            error instanceof Error ? error.message : "Unable to start room",
        });
      } finally {
        await release?.();
      }
    });

    socket.on("room:guess", async ({ code, playerId }, acknowledge) => {
      let release: (() => Promise<void>) | undefined;
      try {
        const roomCode = String(code);
        release = await acquireRoomLock(roomCode);
        const room = await loadRoom(roomCode);
        if (!room?.targetPuzzleId) throw new Error("Round is not available");
        const [target] = await db
          .select({
            id: players.id,
            canonicalName: players.canonicalName,
            snapshot: playerSnapshots,
          })
          .from(puzzles)
          .innerJoin(
            playerSnapshots,
            eq(playerSnapshots.id, puzzles.snapshotId),
          )
          .innerJoin(players, eq(players.id, playerSnapshots.playerId))
          .where(eq(puzzles.id, room.targetPuzzleId))
          .limit(1);
        const [guess] = await db
          .select({
            id: players.id,
            canonicalName: players.canonicalName,
            snapshot: playerSnapshots,
          })
          .from(players)
          .innerJoin(playerSnapshots, eq(playerSnapshots.playerId, players.id))
          .where(
            and(
              eq(players.id, String(playerId)),
              eq(playerSnapshots.reviewStatus, "approved"),
            ),
          )
          .orderBy(sql`${playerSnapshots.dataVersion} desc`)
          .limit(1);
        if (!target || !guess)
          throw new Error("Selected player is unavailable");
        const comparison = compareSoloGuess(guess.snapshot, target.snapshot);
        const result = recordGuess(room, userId, {
          id: randomUUID(),
          playerId: guess.id,
          canonicalName: guess.canonicalName,
          comparison,
          isCorrect: target.id === guess.id,
          points: 0,
        });
        socket.emit("room:guess-result", {
          playerId: guess.id,
          canonicalName: guess.canonicalName,
          isCorrect: target.id === guess.id,
          comparison,
          points: result.points,
        });
        if (room.phase === "finished") {
          room.answerName = target.canonicalName;
          await emitFinishedRoom(room);
        } else {
          await saveRoom(room);
          emitRoom(room);
        }
        acknowledge?.({ ok: true });
      } catch (error) {
        acknowledge?.({
          error:
            error instanceof Error ? error.message : "Unable to submit guess",
        });
      } finally {
        await release?.();
      }
    });

    socket.on("room:surrender", async ({ code }, acknowledge) => {
      let release: (() => Promise<void>) | undefined;
      try {
        const roomCode = String(code);
        release = await acquireRoomLock(roomCode);
        const room = await loadRoom(roomCode);
        if (!room) throw new Error("Room not found");
        surrenderMember(room, userId);
        if (room.phase === "finished") await emitFinishedRoom(room);
        else {
          await saveRoom(room);
          emitRoom(room);
        }
        acknowledge?.({ room: publicRoom(room) });
      } catch (error) {
        acknowledge?.({
          error: error instanceof Error ? error.message : "Unable to surrender",
        });
      } finally {
        await release?.();
      }
    });

    socket.on("room:leave", async ({ code }, acknowledge) => {
      let release: (() => Promise<void>) | undefined;
      try {
        const roomCode = String(code);
        release = await acquireRoomLock(roomCode);
        const room = await loadRoom(roomCode);
        if (!room) throw new Error("Room not found");
        leaveRoom(room, userId);
        await socket.leave(`room:${room.code}`);
        if (!(await disposeIfEmpty(room))) {
          await saveRoom(room);
          emitRoom(room);
          if (room.phase === "finished") scheduleFinishedRoomCleanup(room.code);
        }
        acknowledge?.({ ok: true });
      } catch (error) {
        acknowledge?.({
          error:
            error instanceof Error ? error.message : "Unable to leave room",
        });
      } finally {
        await release?.();
      }
    });

    socket.on("room:rematch", async ({ code }, acknowledge) => {
      let release: (() => Promise<void>) | undefined;
      try {
        const roomCode = String(code);
        release = await acquireRoomLock(roomCode);
        const room = await loadRoom(roomCode);
        if (!room) throw new Error("Room not found");
        voteRematch(room, userId);
        if (room.phase === "countdown") {
          const target = await pickTarget();
          beginRound(room);
          room.targetPlayerId = target.playerId;
          room.targetPuzzleId = target.puzzleId;
          scheduleRoundTimeout(room.code, room.roundEndsAt!);
          io.to(`room:${room.code}`).emit("room:match-started", {
            code: room.code,
          });
        }
        await saveRoom(room);
        emitRoom(room);
        acknowledge?.({ room: publicRoom(room) });
      } catch (error) {
        acknowledge?.({
          error:
            error instanceof Error
              ? error.message
              : "Unable to request rematch",
        });
      } finally {
        await release?.();
      }
    });

    socket.on("room:reconnect", async ({ code }, acknowledge) => {
      let release: (() => Promise<void>) | undefined;
      try {
        const roomCode = String(code).toUpperCase();
        release = await acquireRoomLock(roomCode);
        const room = await reconnect(roomCode);
        acknowledge?.({
          room: publicRoom(room),
          ownGuesses: ownGuesses(room, userId),
        });
      } catch (error) {
        acknowledge?.({
          error: error instanceof Error ? error.message : "Unable to reconnect",
        });
      } finally {
        await release?.();
      }
    });

    socket.on("disconnect", async () => {
      const keys = await redis.keys("valo:room:*");
      for (const key of keys) {
        const code = key.slice("valo:room:".length);
        let release: (() => Promise<void>) | undefined;
        try {
          release = await acquireRoomLock(code);
          const room = await loadRoom(code);
          if (
            !room ||
            !room.members.some(
              (member) =>
                member.userId === userId && member.status === "connected",
            )
          )
            continue;
          const roomSockets = await io.in(`room:${room.code}`).fetchSockets();
          if (roomSockets.some((candidate) => candidate.data.userId === userId))
            continue;
          disconnectMember(room, userId);
          await saveRoom(room);
          emitRoom(room);
          io.to(`room:${room.code}`).emit("room:member-disconnected", {
            userId,
            reconnectDeadline: Date.now() + 20_000,
          });
          scheduleReconnectExpiry(room.code);
        } finally {
          await release?.();
        }
      }
    });

    socket.emit("system:ready", { protocolVersion: 1 });
  });

  return io;
}
