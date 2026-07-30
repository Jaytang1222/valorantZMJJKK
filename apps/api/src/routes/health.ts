import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { redis } from "../redis.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/health", async () => {
    await Promise.all([db.execute(sql`select 1`), redis.ping()]);

    return {
      status: "ok" as const,
      timestamp: new Date().toISOString(),
      services: { database: "ok" as const, redis: "ok" as const },
    };
  });
}
