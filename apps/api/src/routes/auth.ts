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
const displayNameSchema = z.object({
  displayName: z.string().trim().min(3).max(20),
});
const blockedDisplayNameTerms = ["admin", "administrator", "官方", "客服", "系统", "moderator"];

function normalize(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

function sessionFor(userId: string) {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  return { token: `${payload}.${signature}`, expiresAt: new Date(expiresAt).toISOString() };
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const [userId, expiresAt, signature] = token.split(".");
  if (!userId || !expiresAt || !signature || Number(expiresAt) < Date.now()) return null;
  const payload = `${userId}.${expiresAt}`;
  const expected = createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url");
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) return null;
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

  app.put("/v1/auth/me/display-name", async (request, reply) => {
    const userId = verifySession(request.headers.authorization?.replace(/^Bearer\s+/i, ""));
    if (!userId) return reply.unauthorized("Authentication is required");
    const { displayName } = displayNameSchema.parse(request.body);
    const normalizedDisplayName = normalize(displayName);
    if (blockedDisplayNameTerms.some((term) => normalizedDisplayName.includes(term))) return reply.badRequest("This display name is unavailable");
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.normalizedDisplayName, normalizedDisplayName)).limit(1);
    if (existing && existing.id !== userId) return reply.conflict("This display name is unavailable");
    const [user] = await db.update(users).set({ displayName, normalizedDisplayName, updatedAt: new Date() }).where(eq(users.id, userId)).returning({ id: users.id, displayName: users.displayName });
    return { user };
  });
}
