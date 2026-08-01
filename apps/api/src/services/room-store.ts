import { redis } from "../redis.js";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../db/client.js";
import { roomParticipants, rooms } from "../db/schema.js";
import type { LiveRoom } from "./room-state.js";

const roomKey = (code: string) => `valo:room:${code}`;
async function auditRoom(room: LiveRoom) {
  await db.insert(rooms).values({ id: room.id, code: room.code, hostId: room.hostId, state: room.phase, isPublic: room.isPublic, roundCount: room.roundCount, roundDurationSeconds: room.roundDurationSeconds, currentRound: room.roundNumber, startedAt: room.phase === "lobby" ? null : new Date(room.createdAt), finishedAt: room.phase === "finished" ? new Date() : null }).onConflictDoUpdate({ target: rooms.id, set: { hostId: room.hostId, state: room.phase, currentRound: room.roundNumber, finishedAt: room.phase === "finished" ? new Date() : null } });
  await Promise.all(room.members.map((member) => db.insert(roomParticipants).values({ roomId: room.id, userId: member.userId, state: member.status, score: member.score, joinedAt: new Date(member.joinedAt), disconnectedAt: member.disconnectedAt !== undefined ? new Date(member.disconnectedAt) : null, forfeitedAt: member.status === "forfeited" ? new Date() : null }).onConflictDoUpdate({ target: [roomParticipants.roomId, roomParticipants.userId], set: { state: member.status, score: member.score, disconnectedAt: member.disconnectedAt !== undefined ? new Date(member.disconnectedAt) : null, forfeitedAt: member.status === "forfeited" ? new Date() : null } })));
}
export async function saveRoom(room: LiveRoom) { await redis.set(roomKey(room.code), JSON.stringify(room), "EX", 60 * 60 * 6); await auditRoom(room); return room; }
export async function deleteRoom(code: string) { await redis.del(roomKey(code)); }
export async function loadRoom(code: string) { const value = await redis.get(roomKey(code)); if (!value) return null; const room = JSON.parse(value) as LiveRoom; room.roundCount = 1; if ((room.phase as string) === "round_result") room.phase = "finished"; room.members = room.members.map((member) => ({ ...member, feedback: member.feedback ?? [], guesses: member.guesses ?? [], rematchReady: member.rematchReady ?? false })); return room; }
export async function acquireRoomLock(code: string) { const key = `valo:room-lock:${code}`; const token = randomUUID(); for (let attempt = 0; attempt < 20; attempt += 1) { if (await redis.set(key, token, "PX", 5_000, "NX")) return async () => { await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, token); }; await delay(25); } throw new Error("Room is busy; please retry"); }
type QueueEntry = { userId: string; displayName: string; socketId: string; joinedAt: number };
const queueKey = (settings: string) => `valo:match:${settings}`;
export async function enqueueMatch(settings: string, entry: QueueEntry) { await redis.lrem(queueKey(settings), 0, JSON.stringify(entry)); await redis.rpush(queueKey(settings), JSON.stringify(entry)); await redis.expire(queueKey(settings), 300); }
export async function takeMatchOpponent(settings: string, userId: string) { const key = queueKey(settings); const values = await redis.lrange(key, 0, -1); for (const value of values) { const entry = JSON.parse(value) as QueueEntry; if (entry.userId !== userId) { await redis.lrem(key, 1, value); return entry; } } return null; }
export async function cancelMatch(settings: string, userId: string) { const values = await redis.lrange(queueKey(settings), 0, -1); await Promise.all(values.filter((value) => (JSON.parse(value) as QueueEntry).userId === userId).map((value) => redis.lrem(queueKey(settings), 1, value))); }
