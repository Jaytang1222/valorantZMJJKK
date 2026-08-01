import type { Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import { env } from "./config.js";
import { verifyRealtimeTicket } from "./routes/auth.js";
import { redis, redisSubscriber } from "./redis.js";
import { db } from "./db/client.js";
import { playerSnapshots, players, users } from "./db/schema.js";
import { and, eq, sql } from "drizzle-orm";
import { beginCountdown, beginRound, createInviteCode, createLiveRoom, disconnectMember, finishRound, forfeitExpiredMembers, joinRoom, recordGuess, setReady, voteRematch } from "./services/room-state.js";
import { acquireRoomLock, cancelMatch, enqueueMatch, listPublicRooms, loadRoom, saveRoom, takeMatchOpponent } from "./services/room-store.js";
import { compareSoloGuess } from "./lib/solo-comparison.js";

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
  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    const publicRoom = <T extends NonNullable<Awaited<ReturnType<typeof loadRoom>>>>(room: T) => { const { targetPlayerId: _targetPlayerId, ...safe } = room; return safe; };
    const emitRoom = (room: Awaited<ReturnType<typeof loadRoom>>) => { if (room) io.to(`room:${room.code}`).emit("room:state", publicRoom(room)); };
    const getUser = async () => {
      const [user] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new Error("User not found");
      return user;
    };
    const pickTarget = async () => {
      const [target] = await db.select({ id: players.id, snapshot: playerSnapshots }).from(players).innerJoin(playerSnapshots, eq(playerSnapshots.playerId, players.id)).where(and(eq(players.status, "active"), eq(playerSnapshots.reviewStatus, "approved"))).orderBy(sql`random()`).limit(1);
      if (!target) throw new Error("No approved puzzle is available");
      return target;
    };
    const scheduleRoundTimeout = (code: string, endsAt: number) => {
      setTimeout(async () => { const room = await loadRoom(code); if (!room || room.phase !== "playing" || room.roundEndsAt !== endsAt) return; const [target] = room.targetPlayerId ? await db.select({ canonicalName: players.canonicalName }).from(players).where(eq(players.id, room.targetPlayerId)).limit(1) : []; finishRound(room); await saveRoom(room); emitRoom(room); if (target) io.to(`room:${room.code}`).emit("room:round-result", { room: publicRoom(room), target }); }, Math.max(0, endsAt - Date.now())).unref();
    };
    socket.on("room:create", async (input, acknowledge) => {
      try {
        const user = await getUser();
        let code = createInviteCode();
        while (await loadRoom(code)) code = createInviteCode();
        const room = createLiveRoom({ id: crypto.randomUUID(), code, hostId: userId, isPublic: Boolean(input?.isPublic), maxPlayers: Number(input?.maxPlayers ?? 2), roundCount: Number(input?.roundCount ?? 1), roundDurationSeconds: Number(input?.roundDurationSeconds ?? 60), host: { userId, displayName: user.displayName, status: "connected", ready: false, score: 0, guessCount: 0, joinedAt: Date.now() } });
        await saveRoom(room); await socket.join(`room:${code}`); acknowledge?.({ room: publicRoom(room) });
      } catch (error) { acknowledge?.({ error: error instanceof Error ? error.message : "Unable to create room" }); }
    });
    socket.on("room:list-public", async (_, acknowledge) => { acknowledge?.({ rooms: await listPublicRooms() }); });
    socket.on("match:join", async (input, acknowledge) => {
      try {
        const maxPlayers = Number(input?.maxPlayers ?? 2); const roundCount = Number(input?.roundCount ?? 1); const roundDurationSeconds = Number(input?.roundDurationSeconds ?? 60);
        const settings = `${maxPlayers}:${roundCount}:${roundDurationSeconds}`; const user = await getUser(); const opponent = await takeMatchOpponent(settings, userId);
        if (!opponent) { await enqueueMatch(settings, { userId, displayName: user.displayName, socketId: socket.id, joinedAt: Date.now() }); acknowledge?.({ waiting: true }); return; }
        let code = createInviteCode(); while (await loadRoom(code)) code = createInviteCode();
        const room = createLiveRoom({ id: crypto.randomUUID(), code, hostId: opponent.userId, isPublic: true, maxPlayers, roundCount, roundDurationSeconds, host: { userId: opponent.userId, displayName: opponent.displayName, status: "connected", ready: false, score: 0, guessCount: 0, joinedAt: opponent.joinedAt } });
        joinRoom(room, { userId, displayName: user.displayName, status: "connected", ready: false, score: 0, guessCount: 0, joinedAt: Date.now() }); await saveRoom(room); await io.in([socket.id, opponent.socketId]).socketsJoin(`room:${code}`); io.to(opponent.socketId).emit("match:found", { room: publicRoom(room) }); acknowledge?.({ room: publicRoom(room) }); emitRoom(room);
      } catch (error) { acknowledge?.({ error: error instanceof Error ? error.message : "Unable to join matchmaking" }); }
    });
    socket.on("match:cancel", async (input, acknowledge) => { const settings = `${Number(input?.maxPlayers ?? 2)}:${Number(input?.roundCount ?? 1)}:${Number(input?.roundDurationSeconds ?? 60)}`; await cancelMatch(settings, userId); acknowledge?.({ ok: true }); });
    socket.on("room:join", async ({ code }, acknowledge) => {
      try {
        const room = await loadRoom(String(code).toUpperCase()); if (!room) throw new Error("Room not found");
        const user = await getUser(); joinRoom(room, { userId, displayName: user.displayName, status: "connected", ready: false, score: 0, guessCount: 0, joinedAt: Date.now() }); await saveRoom(room); await socket.join(`room:${room.code}`); emitRoom(room); acknowledge?.({ room: publicRoom(room) });
      } catch (error) { acknowledge?.({ error: error instanceof Error ? error.message : "Unable to join room" }); }
    });
    socket.on("room:ready", async ({ code, ready }, acknowledge) => {
      try { const room = await loadRoom(String(code)); if (!room) throw new Error("Room not found"); setReady(room, userId, Boolean(ready)); await saveRoom(room); emitRoom(room); acknowledge?.({ room: publicRoom(room) }); } catch (error) { acknowledge?.({ error: error instanceof Error ? error.message : "Unable to update ready state" }); }
    });
    socket.on("room:start", async ({ code }, acknowledge) => {
      try { const room = await loadRoom(String(code)); if (!room) throw new Error("Room not found"); beginCountdown(room, userId); const target = await pickTarget(); beginRound(room); room.targetPlayerId = target.id; await saveRoom(room); scheduleRoundTimeout(room.code, room.roundEndsAt!); emitRoom(room); acknowledge?.({ room: publicRoom(room) }); } catch (error) { acknowledge?.({ error: error instanceof Error ? error.message : "Unable to start room" }); }
    });
    socket.on("room:guess", async ({ code, playerId }, acknowledge) => {
      let release: (() => Promise<void>) | undefined;
      try {
        release = await acquireRoomLock(String(code));
        const room = await loadRoom(String(code)); if (!room?.targetPlayerId) throw new Error("Round is not available");
        const [target] = await db.select({ id: players.id, canonicalName: players.canonicalName, snapshot: playerSnapshots }).from(players).innerJoin(playerSnapshots, eq(playerSnapshots.playerId, players.id)).where(and(eq(players.id, room.targetPlayerId), eq(playerSnapshots.reviewStatus, "approved"))).limit(1);
        const [guess] = await db.select({ id: players.id, canonicalName: players.canonicalName, snapshot: playerSnapshots }).from(players).innerJoin(playerSnapshots, eq(playerSnapshots.playerId, players.id)).where(and(eq(players.id, String(playerId)), eq(playerSnapshots.reviewStatus, "approved"))).orderBy(sql`${playerSnapshots.dataVersion} desc`).limit(1);
        if (!target || !guess) throw new Error("Selected player is unavailable");
        const comparison = compareSoloGuess(guess.snapshot, target.snapshot);
        const result = recordGuess(room, userId, target.id === guess.id, Object.values(comparison)); await saveRoom(room); socket.emit("room:guess-result", { playerId: guess.id, canonicalName: guess.canonicalName, isCorrect: target.id === guess.id, comparison, points: result.points });
        if (room.phase !== "playing") io.to(`room:${room.code}`).emit("room:round-result", { room: publicRoom(room), target: { canonicalName: target.canonicalName } });
        emitRoom(room); acknowledge?.({ ok: true });
      } catch (error) { acknowledge?.({ error: error instanceof Error ? error.message : "Unable to submit guess" }); } finally { await release?.(); }
    });
    socket.on("room:rematch", async ({ code }, acknowledge) => {
      let release: (() => Promise<void>) | undefined;
      try { release = await acquireRoomLock(String(code)); const room = await loadRoom(String(code)); if (!room) throw new Error("Room not found"); voteRematch(room, userId); if (room.phase === "countdown") { const target = await pickTarget(); beginRound(room); room.targetPlayerId = target.id; scheduleRoundTimeout(room.code, room.roundEndsAt!); } await saveRoom(room); emitRoom(room); acknowledge?.({ room: publicRoom(room) }); } catch (error) { acknowledge?.({ error: error instanceof Error ? error.message : "Unable to request rematch" }); } finally { await release?.(); }
    });
    socket.on("room:reconnect", async ({ code }, acknowledge) => {
      try { const room = await loadRoom(String(code)); if (!room) throw new Error("Room not found"); const user = await getUser(); joinRoom(room, { userId, displayName: user.displayName, status: "connected", ready: false, score: 0, guessCount: 0, joinedAt: Date.now() }); await saveRoom(room); await socket.join(`room:${room.code}`); emitRoom(room); acknowledge?.({ room: publicRoom(room) }); } catch (error) { acknowledge?.({ error: error instanceof Error ? error.message : "Unable to reconnect" }); }
    });
    socket.on("disconnect", async () => {
      const keys = await redis.keys("valo:room:*");
      for (const key of keys) { const code = key.slice("valo:room:".length); const room = await loadRoom(code); if (room && room.members.some((member) => member.userId === userId && member.status === "connected")) { disconnectMember(room, userId); await saveRoom(room); emitRoom(room); io.to(`room:${room.code}`).emit("room:member-disconnected", { userId, reconnectDeadline: Date.now() + 20_000 }); setTimeout(async () => { const latest = await loadRoom(code); if (latest) { forfeitExpiredMembers(latest); await saveRoom(latest); emitRoom(latest); } }, 20_100).unref(); } }
    });
    socket.emit("system:ready", { protocolVersion: 1 });
  });

  return io;
}
