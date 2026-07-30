import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, closeDatabase } from "../db/client.js";

try {
  await migrate(db, { migrationsFolder: "drizzle" });
} finally {
  await closeDatabase();
}
