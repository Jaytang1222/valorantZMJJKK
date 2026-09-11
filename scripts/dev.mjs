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
const localAdminDefaults = {
  ADMIN_USERNAME: "local-admin",
  ADMIN_PASSWORD: "local-admin-123456",
};
const requiredLocalConfig = Object.keys(localAdminDefaults);
const requiredLocalSecrets = [
  "DATABASE_URL",
  "REDIS_URL",
  "SESSION_SECRET",
  "PASSWORD_PEPPER",
  "INTERNAL_API_SECRET",
  "USER_SESSION_SECRET",
  "ADMIN_SESSION_SECRET",
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    // Windows exposes pnpm as a .cmd shim; Node 24 rejects spawning it
    // directly with shell:false (EINVAL), so use the platform shell there.
    shell: process.platform === "win32",
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
    const contents = readFileSync(envPath, "utf8");
    const missingConfig = requiredLocalConfig.filter(
      (key) => !new RegExp(`^${key}=.+$`, "m").test(contents),
    );
    const missingSecrets = requiredLocalSecrets.filter(
      (key) => !new RegExp(`^${key}=.+$`, "m").test(contents),
    );
    if (missingConfig.length === 0 && missingSecrets.length === 0) {
      console.info("Using existing .env");
      return;
    }
    if (missingSecrets.includes("DATABASE_URL"))
      throw new Error("Existing .env is missing DATABASE_URL");
    if (missingSecrets.includes("REDIS_URL"))
      throw new Error("Existing .env is missing REDIS_URL");
    const additions = [
      ...missingConfig.map((key) => `${key}=${localAdminDefaults[key]}`),
      ...missingSecrets.map((key) => `${key}=${secret()}`),
    ].join("\n");
    writeFileSync(envPath, `${contents.trimEnd()}\n${additions}\n`, {
      encoding: "utf8",
    });
    console.info(
      `Added missing local settings: ${[
        ...missingConfig,
        ...missingSecrets,
      ].join(", ")}`,
    );
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
    `ADMIN_SESSION_SECRET=${secret()}`,
    `ADMIN_USERNAME=${localAdminDefaults.ADMIN_USERNAME}`,
    `ADMIN_PASSWORD=${localAdminDefaults.ADMIN_PASSWORD}`,
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
  const missing = [...requiredLocalConfig, ...requiredLocalSecrets].filter(
    (key) => !new RegExp(`^${key}=.+$`, "m").test(contents),
  );
  if (missing.length > 0) {
    throw new Error(`.env is missing: ${missing.join(", ")}`);
  }
}

function loadLocalEnvIntoProcess() {
  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2];
  }
}

createLocalEnv();
assertLocalEnv();
loadLocalEnvIntoProcess();

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
  shell: process.platform === "win32",
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
