import { createHmac, randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const RATE_LIMIT_COOKIE = "valo_rate_limit_client";

export function getRateLimitProxy(request: NextRequest): {
  headers: Record<string, string>;
  cookieValue?: string;
} {
  const secret = process.env.RATE_LIMIT_PROXY_SECRET;
  if (process.env.NODE_ENV === "production" && !secret)
    throw new Error("RATE_LIMIT_PROXY_SECRET is required in production");
  if (!secret) return { headers: {} };

  const existing = request.cookies.get(RATE_LIMIT_COOKIE)?.value;
  const cookieValue = existing ?? randomUUID();
  const forwardedFor =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown-client-ip";
  const source = `${cookieValue}:${forwardedFor}`;
  return {
    cookieValue: existing ? undefined : cookieValue,
    headers: {
      "x-rate-limit-client": source,
      "x-rate-limit-signature": createHmac("sha256", secret)
        .update(source)
        .digest("base64url"),
    },
  };
}

export function setRateLimitCookie(
  response: NextResponse,
  cookieValue: string | undefined,
) {
  if (!cookieValue) return;
  response.cookies.set(RATE_LIMIT_COOKIE, cookieValue, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
