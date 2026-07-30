import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config.js";

export const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool);

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
