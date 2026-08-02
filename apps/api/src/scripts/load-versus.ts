import { performance } from "node:perf_hooks";
import { io, type Socket } from "socket.io-client";

type RoomReply = { room?: { code: string }; error?: string; waiting?: boolean };
type MetricSamples = Record<string, number[]>;

const apiUrl = required("LOAD_API_URL").replace(/\/$/, "");
const confirmation = required("LOAD_CONFIRM");
const password = required("LOAD_PASSWORD");
const roomCount = positiveInteger("LOAD_ROOM_COUNT", 2, 100);
const workers = positiveInteger("LOAD_WORKERS", roomCount, roomCount);
const holdSeconds = positiveInteger("LOAD_HOLD_SECONDS", 15, 600);
const roundDurationSeconds = positiveInteger("LOAD_ROUND_DURATION_SECONDS", 90, 90);
const rampSeconds = nonNegativeInteger("LOAD_RAMP_SECONDS", 0, 300);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const metrics: MetricSamples = {};
const failures: string[] = [];

if (confirmation !== "RUN_STAGING_LOAD") throw new Error("Set LOAD_CONFIRM=RUN_STAGING_LOAD to run the load test");
if (!apiUrl.startsWith("https://") && process.env.ALLOW_INSECURE_LOAD !== "true") throw new Error("LOAD_API_URL must use HTTPS unless ALLOW_INSECURE_LOAD=true");
if (![30, 60, 90].includes(roundDurationSeconds)) throw new Error("LOAD_ROUND_DURATION_SECONDS must be 30, 60, or 90");
if (holdSeconds > roundDurationSeconds - 5) throw new Error("LOAD_HOLD_SECONDS must leave at least 5 seconds before the round timeout");

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be an integer from 1 to ${maximum}`);
  return value;
}

function nonNegativeInteger(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0 || value > maximum) throw new Error(`${name} must be an integer from 0 to ${maximum}`);
  return value;
}

function record(metric: string, durationMs: number) {
  (metrics[metric] ??= []).push(durationMs);
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]);
}

async function post(path: string, body: unknown, token?: string) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`${path}: ${String(data.error ?? response.status)}`);
  return data;
}

async function createTicket(index: number) {
  const email = `m2-load-${runId}-${index}@example.test`;
  const registered = await post("/v1/auth/register", { email, password }) as { session: { token: string } };
  const ticket = await post("/v1/auth/realtime-ticket", {}, registered.session.token) as { ticket: { token: string } };
  return ticket.ticket.token;
}

function connect(ticket: string) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = io(apiUrl, { auth: { ticket }, transports: ["websocket", "polling"], timeout: 15_000, reconnection: false });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Socket connection timed out"));
    }, 16_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function emit(socket: Socket, event: string, payload: object) {
  return new Promise<RoomReply>((resolve, reject) => {
    socket.timeout(12_000).emit(event, payload, (error: Error | null, reply: RoomReply) => {
      if (error) reject(error);
      else if (reply?.error) reject(new Error(reply.error));
      else resolve(reply);
    });
  });
}

async function timed<T>(metric: string, action: () => Promise<T>) {
  const started = performance.now();
  try {
    return await action();
  } finally {
    record(metric, performance.now() - started);
  }
}

async function runRoom(index: number) {
  let host: Socket | undefined;
  let guest: Socket | undefined;
  try {
    const startDelayMs = Math.floor((index * rampSeconds * 1_000) / roomCount);
    if (startDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, startDelayMs));
    const [hostTicket, guestTicket] = await timed("auth_and_ticket", async () => Promise.all([createTicket(index * 2), createTicket(index * 2 + 1)]));
    [host, guest] = await timed("socket_connect", async () => Promise.all([connect(hostTicket), connect(guestTicket)]));
    const created = await timed("room_create", () => emit(host!, "room:create", { maxPlayers: 2, roundCount: 1, roundDurationSeconds }));
    if (!created.room) throw new Error("Room creation returned no room");
    const code = created.room.code;
    await timed("room_join", () => emit(guest!, "room:join", { code }));
    await timed("room_ready", async () => {
      await Promise.all([
        emit(host!, "room:ready", { code, ready: true }),
        emit(guest!, "room:ready", { code, ready: true }),
      ]);
    });
    await timed("room_start", () => emit(host!, "room:start", { code }));
    await new Promise((resolve) => setTimeout(resolve, holdSeconds * 1_000));
    await timed("room_surrender", () => emit(guest!, "room:surrender", { code }));
    await Promise.allSettled([
      emit(host!, "room:leave", { code }),
      emit(guest!, "room:leave", { code }),
    ]);
  } catch (error) {
    failures.push(`room ${index}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    host?.disconnect();
    guest?.disconnect();
  }
}

let nextRoom = 0;
await Promise.all(Array.from({ length: Math.min(workers, roomCount) }, async () => {
  while (true) {
    const roomIndex = nextRoom;
    nextRoom += 1;
    if (roomIndex >= roomCount) return;
    await runRoom(roomIndex);
  }
}));

const report = Object.fromEntries(Object.entries(metrics).map(([metric, values]) => [metric, {
  count: values.length,
  p50Ms: percentile(values, 0.5),
  p95Ms: percentile(values, 0.95),
  maxMs: percentile(values, 1),
}]));
console.log(JSON.stringify({ runId, roomCount, workers, holdSeconds, roundDurationSeconds, rampSeconds, failures, metrics: report }, null, 2));
if (failures.length > 0) process.exitCode = 1;
