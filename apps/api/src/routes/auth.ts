import argon2 from "argon2";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
});
function normalize(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

function signedToken(userId: string, lifetimeMs: number, purpose = "session") {
  const expiresAt = Date.now() + lifetimeMs;
  const payload = `${purpose}.${userId}.${expiresAt}`;
  const signature = createHmac("sha256", env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  return { token: `${payload}.${signature}`, expiresAt: new Date(expiresAt).toISOString() };
}
function sessionFor(userId: string) {
  return signedToken(userId, 30 * 24 * 60 * 60 * 1000);
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const [purpose, userId, expiresAt, signature] = token.split(".");
  if (purpose !== "session" || !userId || !expiresAt || !signature || Number(expiresAt) < Date.now()) return null;
  const payload = `${purpose}.${userId}.${expiresAt}`;
  const expected = createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url");
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) return null;
  return z.string().uuid().safeParse(userId).success ? userId : null;
}

export function verifyRealtimeTicket(token: string | undefined): string | null {
  if (!token) return null;
  const [purpose, userId, expiresAt, signature] = token.split(".");
  if (purpose !== "realtime" || !userId || !expiresAt || !signature || Number(expiresAt) < Date.now()) return null;
  const payload = `${purpose}.${userId}.${expiresAt}`;
  const expected = Buffer.from(createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url"));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return z.string().uuid().safeParse(userId).success ? userId : null;
}

async function defaultName() {
  for (let index = 0; index < 10; index += 1) {
    const suffix = randomBytes(5).toString("base64url").slice(0, 6).toUpperCase();
    const displayName = `瓦友#${suffix}`;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.normalizedDisplayName, normalize(displayName))).limit(1);
    if (!existing) return displayName;
  }
  throw new Error("Unable to allocate a display name");
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/auth/register", async (request, reply) => {
    if (!env.PASSWORD_PEPPER) return reply.serviceUnavailable("Password registration is not configured");
    const input = credentialsSchema.parse(request.body);
    const email = normalize(input.email);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, email)).limit(1);
    if (existing) return reply.conflict("This email is already registered");
    const displayName = await defaultName();
    const passwordHash = await argon2.hash(`${input.password}${env.PASSWORD_PEPPER}`, { type: argon2.argon2id });
    const [user] = await db.insert(users).values({ displayName, normalizedDisplayName: normalize(displayName), email: input.email.trim(), normalizedEmail: email, passwordHash }).returning({ id: users.id, displayName: users.displayName });
    return reply.status(201).send({ user, session: sessionFor(user.id) });
  });

  app.post("/v1/auth/login", async (request, reply) => {
    if (!env.PASSWORD_PEPPER) return reply.serviceUnavailable("Password login is not configured");
    const input = credentialsSchema.parse(request.body);
    const [user] = await db.select({ id: users.id, displayName: users.displayName, passwordHash: users.passwordHash }).from(users).where(eq(users.normalizedEmail, normalize(input.email))).limit(1);
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, `${input.password}${env.PASSWORD_PEPPER}`))) return reply.unauthorized("Invalid email or password");
    return { user: { id: user.id, displayName: user.displayName }, session: sessionFor(user.id) };
  });

  app.get("/v1/auth/me", async (request, reply) => {
    const userId = verifySession(request.headers.authorization?.replace(/^Bearer\s+/i, ""));
    if (!userId) return reply.unauthorized("Authentication is required");
    const [user] = await db.select({ id: users.id, displayName: users.displayName, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return reply.unauthorized("Authentication is required");
    return { user };
  });

  app.post("/v1/auth/realtime-ticket", async (request, reply) => {
    const userId = verifySession(request.headers.authorization?.replace(/^Bearer\s+/i, ""));
    if (!userId) return reply.unauthorized("Authentication is required");
    return { ticket: signedToken(userId, 5 * 60 * 1000, "realtime") };
  });

}
