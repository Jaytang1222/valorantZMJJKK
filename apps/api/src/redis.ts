import { Redis } from "ioredis";
import { env } from "./config.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
});

export const redisSubscriber = redis.duplicate();

export async function closeRedis(): Promise<void> {
  await Promise.all([redis.quit(), redisSubscriber.quit()]);
}
