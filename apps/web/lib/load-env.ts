import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(resolve(process.cwd(), "../../.env"));
} catch {
  // Hosted environments provide process variables directly.
}
