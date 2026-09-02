import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.info("Usage: node scripts/dev.mjs [--seed]");
  console.info(
    "  --seed  import the private data/players.seed.csv after migration",
  );
  process.exit(0);
}
const unknownArgs = args.filter((arg) => arg !== "--seed");
if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument: ${unknownArgs.join(", ")}`);
}
const seedRequested = args.includes("--seed");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function secret() {
  return randomBytes(32).toString("base64url");
}

function createLocalEnv() {
  if (existsSync(envPath)) {
    console.info("Using existing .env");
    return;
  }

  const contents = [
    "NODE_ENV=development",
    "API_PORT=3001",
    "DATABASE_URL=postgresql://valo:valo@localhost:5432/valo_yiba",
    "REDIS_URL=redis://localhost:6379",
    `SESSION_SECRET=${secret()}`,
    `PASSWORD_PEPPER=${secret()}`,
    `INTERNAL_API_SECRET=${secret()}`,
    `RATE_LIMIT_PROXY_SECRET=${secret()}`,
    `USER_SESSION_SECRET=${secret()}`,
    "CORS_ORIGIN=http://localhost:3000",
    "API_BASE_URL=http://localhost:3001",
    "NEXT_PUBLIC_API_BASE_URL=http://localhost:3001",
    "NEXT_PUBLIC_WS_URL=http://localhost:3001",
    "",
  ].join("\n");
  writeFileSync(envPath, contents, { encoding: "utf8", flag: "wx" });
  console.info("Created .env with local-only random secrets.");
}

function assertLocalEnv() {
  const contents = readFileSync(envPath, "utf8");
  const required = [
    "DATABASE_URL",
    "REDIS_URL",
    "SESSION_SECRET",
    "PASSWORD_PEPPER",
    "INTERNAL_API_SECRET",
    "USER_SESSION_SECRET",
  ];
  const missing = required.filter(
    (key) => !new RegExp(`^${key}=.+$`, "m").test(contents),
  );
  if (missing.length > 0) {
    throw new Error(`.env is missing: ${missing.join(", ")}`);
  }
}

createLocalEnv();
assertLocalEnv();

run("docker", ["compose", "up", "-d", "--wait"]);
run(pnpm, ["db:migrate"]);

if (seedRequested) {
  const seedPath = resolve(root, "data", "players.seed.csv");
  if (!existsSync(seedPath)) {
    throw new Error(
      "--seed was requested, but private data/players.seed.csv was not found.",
    );
  }
  run(pnpm, ["db:seed"]);
}

console.info("Starting Web and API development servers...");
const child = spawn(pnpm, ["dev"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});

function stop(signal) {
  if (!child.killed) child.kill(signal);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
