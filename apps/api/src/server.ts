import { apiPort } from "./config.js";
import { closeDatabase } from "./db/client.js";
import { createRealtimeServer } from "./realtime.js";
import { closeRedis } from "./redis.js";
import { buildApp } from "./app.js";

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
