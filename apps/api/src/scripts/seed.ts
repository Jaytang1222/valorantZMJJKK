import { closeDatabase } from "../db/client.js";
import { seedInitialPlayerData } from "../services/initial-seed.js";

try {
  const count = await seedInitialPlayerData(process.argv[2]);
  console.info(`Seeded ${count} player drafts.`);
} finally {
  await closeDatabase();
}
