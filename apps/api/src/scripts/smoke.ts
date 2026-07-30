import assert from "node:assert/strict";
import { buildApp } from "../app.js";
import { closeDatabase } from "../db/client.js";
import { closeRedis } from "../redis.js";

const app = await buildApp();

try {
  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json().services, { database: "ok", redis: "ok" });

  const publicPlayers = await app.inject({ method: "GET", url: "/v1/players" });
  assert.equal(publicPlayers.statusCode, 200);
  assert.deepEqual(publicPlayers.json(), []);
  console.info(
    "Smoke test passed: database, Redis, and public visibility checks are healthy.",
  );
} finally {
  await app.close();
  await Promise.all([closeRedis(), closeDatabase()]);
}
