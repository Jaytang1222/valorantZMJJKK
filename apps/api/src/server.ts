import { apiPort } from "./config.js";
import { closeDatabase } from "./db/client.js";
import { createRealtimeServer } from "./realtime.js";
import "./observability.js";
import { closeRedis } from "./redis.js";
import { seedInitialPlayerData } from "./services/initial-seed.js";
import { buildApp } from "./app.js";

if (process.env.SEED_INITIAL_DATA === "true") {
  console.info(
    "SEED_INITIAL_DATA is enabled; importing initial player drafts.",
  );
  const count = await seedInitialPlayerData();
  console.info(`Initial player import completed: ${count} drafts.`);
} else {
  console.info("Initial player import skipped.");
}

const app = await buildApp();

const io = createRealtimeServer(app.server);

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting down");
  io.close();
  await app.close();
  await Promise.all([closeRedis(), closeDatabase()]);
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.ready();
await app.listen({ port: apiPort, host: "0.0.0.0" });
