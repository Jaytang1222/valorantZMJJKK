import { closeDatabase } from "../db/client.js";
import { seedInitialPlayerData } from "../services/initial-seed.js";

try {
  const count = await seedInitialPlayerData(process.argv[2]);
  console.info(`Synchronized ${count} approved player records from CSV.`);
} finally {
  await closeDatabase();
}
