import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// pnpm runs workspace scripts from apps/api; production receives variables directly.
loadDotenv({ path: resolve(process.cwd(), "../../.env") });

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  PORT: z.coerce.number().int().positive().optional(),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  INTERNAL_API_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url().optional(),
});

export const env = environmentSchema.parse(process.env);
export const apiPort = env.PORT ?? env.API_PORT;
