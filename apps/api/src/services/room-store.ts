import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../db/client.js";
import { guesses, roomParticipants, roomRounds, rooms } from "../db/schema.js";
import { redis } from "../redis.js";
import { invalidateLeaderboard } from "./leaderboard.js";
import type { LiveRoom } from "./room-state.js";

const roomKey = (code: string) => `valo:room:${code}`;
const queueKey = (settings: string) => `valo:match:${settings}`;

function isRankedEligible(room: LiveRoom) {
  return (
    room.isMatchmade &&
    room.phase === "finished" &&
    room.members.length === 2 &&
    Boolean(room.winnerId)
  );
}

function asDate(timestamp: number | undefined) {
  return timestamp === undefined ? null : new Date(timestamp);
}

async function auditRoom(room: LiveRoom) {
  const rankedEligible = isRankedEligible(room);
  await db.transaction(async (tx) => {
    await tx
      .insert(rooms)
      .values({
        id: room.id,
        code: room.code,
        hostId: room.hostId,
        state: room.phase,
        isPublic: false,
        isMatchmade: room.isMatchmade,
        rankedEligible,
        roundCount: room.roundCount,
        roundDurationSeconds: room.roundDurationSeconds,
        currentRound: room.roundNumber,
        startedAt: asDate(room.roundStartedAt),
        finishedAt: asDate(room.roundFinishedAt),
        winnerUserId: room.winnerId,
        finishReason: room.finishReason,
      })
      .onConflictDoUpdate({
        target: rooms.id,
        set: {
          hostId: room.hostId,
          state: room.phase,
          isMatchmade: room.isMatchmade,
          rankedEligible,
          currentRound: room.roundNumber,
          startedAt: asDate(room.roundStartedAt),
          finishedAt: asDate(room.roundFinishedAt),
          winnerUserId: room.winnerId,
          finishReason: room.finishReason,
        },
      });

    await Promise.all(
      room.members.map((member) =>
        tx
          .insert(roomParticipants)
          .values({
            roomId: room.id,
            userId: member.userId,
            state: member.status,
            score: member.score,
            joinedAt: new Date(member.joinedAt),
            disconnectedAt: asDate(member.disconnectedAt),
            forfeitedAt: member.status === "forfeited" ? new Date() : null,
          })
          .onConflictDoUpdate({
            target: [roomParticipants.roomId, roomParticipants.userId],
            set: {
              state: member.status,
              score: member.score,
              disconnectedAt: asDate(member.disconnectedAt),
              forfeitedAt: member.status === "forfeited" ? new Date() : null,
            },
          }),
      ),
    );

    if (!room.targetPuzzleId || room.roundNumber < 1) return;
    const [round] = await tx
      .insert(roomRounds)
      .values({
        roomId: room.id,
        puzzleId: room.targetPuzzleId,
        roundNumber: room.roundNumber,
        startedAt: asDate(room.roundStartedAt),
        finishedAt: asDate(room.roundFinishedAt),
        winnerUserId: room.winnerId,
        finishReason: room.finishReason,
      })
      .onConflictDoUpdate({
        target: [roomRounds.roomId, roomRounds.roundNumber],
        set: {
          puzzleId: room.targetPuzzleId,
          startedAt: asDate(room.roundStartedAt),
          finishedAt: asDate(room.roundFinishedAt),
          winnerUserId: room.winnerId,
          finishReason: room.finishReason,
        },
      })
      .returning({ id: roomRounds.id });
    if (!round) return;

    const auditedGuesses = room.members.flatMap((member) =>
      member.guesses
        .filter((guess) => Boolean(guess.id && guess.playerId))
        .map((guess) => ({
          id: guess.id,
          roomRoundId: round.id,
          userId: member.userId,
          guessedPlayerId: guess.playerId,
          isCorrect: guess.isCorrect,
          comparison: guess.comparison,
        })),
    );
    if (auditedGuesses.length > 0)
      await tx.insert(guesses).values(auditedGuesses).onConflictDoNothing();
  });
}

export async function saveRoom(room: LiveRoom) {
  await auditRoom(room);
  await redis.set(roomKey(room.code), JSON.stringify(room), "EX", 60 * 60 * 6);
  if (isRankedEligible(room)) await invalidateLeaderboard("versus");
  return room;
}

export async function deleteRoom(code: string) {
  await redis.del(roomKey(code));
}

export async function loadRoom(code: string) {
  const value = await redis.get(roomKey(code));
  if (!value) return null;
  const room = JSON.parse(value) as LiveRoom;
  room.isPublic = false;
  room.isMatchmade = room.isMatchmade ?? false;
  room.maxPlayers = 2;
  room.roundCount = 1;
  if ((room.phase as string) === "round_result") room.phase = "finished";
  room.members = room.members.map((member) => ({
    ...member,
    feedback: member.feedback ?? [],
    guesses: member.guesses ?? [],
    rematchReady: member.rematchReady ?? false,
  }));
  return room;
}

async function acquireLock(key: string) {
  const token = randomUUID();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await redis.set(key, token, "PX", 5_000, "NX")) {
      return async () => {
        await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          key,
          token,
        );
      };
    }
    await delay(25);
  }
  throw new Error("Operation is busy; please retry");
}

export function acquireRoomLock(code: string) {
  return acquireLock(`valo:room-lock:${code}`);
}

export function acquireMatchLock(settings: string) {
  return acquireLock(`valo:match-lock:${settings}`);
}

export type QueueEntry = {
  userId: string;
  displayName: string;
  socketId: string;
  joinedAt: number;
};

export async function cancelMatch(settings: string, userId: string) {
  const key = queueKey(settings);
  const values = await redis.lrange(key, 0, -1);
  await Promise.all(
    values
      .filter((value) => (JSON.parse(value) as QueueEntry).userId === userId)
      .map((value) => redis.lrem(key, 1, value)),
  );
}

export async function enqueueMatch(settings: string, entry: QueueEntry) {
  await cancelMatch(settings, entry.userId);
  const key = queueKey(settings);
  await redis.rpush(key, JSON.stringify(entry));
  await redis.expire(key, 300);
}

export async function takeMatchOpponent(settings: string, userId: string) {
  const key = queueKey(settings);
  const values = await redis.lrange(key, 0, -1);
  for (const value of values) {
    const entry = JSON.parse(value) as QueueEntry;
    await redis.lrem(key, 1, value);
    if (entry.userId !== userId) return entry;
  }
  return null;
}
