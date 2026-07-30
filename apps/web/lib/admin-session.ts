import { createHmac, timingSafeEqual } from "node:crypto";

const cookieName = "valo_admin_session";
const sessionDurationSeconds = 8 * 60 * 60;

function required(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`Missing required admin environment variable: ${name}`);
  return value;
}

function sign(value: string): string {
  return createHmac("sha256", required("ADMIN_SESSION_SECRET"))
    .update(value)
    .digest("base64url");
}

export function verifyAdminCredentials(
  username: string,
  password: string,
): boolean {
  const expectedUsername = Buffer.from(required("ADMIN_USERNAME"));
  const expectedPassword = Buffer.from(required("ADMIN_PASSWORD"));
  const actualUsername = Buffer.from(username);
  const actualPassword = Buffer.from(password);

  return (
    expectedUsername.length === actualUsername.length &&
    expectedPassword.length === actualPassword.length &&
    timingSafeEqual(expectedUsername, actualUsername) &&
    timingSafeEqual(expectedPassword, actualPassword)
  );
}

export function createAdminSession(username: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + sessionDurationSeconds;
  const payload = `${username}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function isValidAdminSession(value: string | undefined): boolean {
  if (!value) return false;
  const [username, expiresAtString, signature] = value.split(".");
  const expiresAt = Number(expiresAtString);
  if (
    !username ||
    !Number.isInteger(expiresAt) ||
    expiresAt < Math.floor(Date.now() / 1000)
  )
    return false;
  const expectedSignature = Buffer.from(sign(`${username}.${expiresAt}`));
  const actualSignature = Buffer.from(signature ?? "");
  return (
    expectedSignature.length === actualSignature.length &&
    timingSafeEqual(expectedSignature, actualSignature)
  );
}

export const adminCookie = {
  name: cookieName,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: sessionDurationSeconds,
  },
};
