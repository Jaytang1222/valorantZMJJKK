import { createHmac, timingSafeEqual } from "node:crypto";

const secret = process.env.USER_SESSION_SECRET;

function signature(value: string) {
  if (!secret) throw new Error("USER_SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function sealUserSession(token: string) {
  const value = Buffer.from(token).toString("base64url");
  return `${value}.${signature(value)}`;
}

export function unsealUserSession(value: string | undefined) {
  if (!value) return null;
  const [token, provided] = value.split(".");
  if (!token || !provided) return null;
  const expected = Buffer.from(signature(token));
  const actual = Buffer.from(provided);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return Buffer.from(token, "base64url").toString("utf8");
}
