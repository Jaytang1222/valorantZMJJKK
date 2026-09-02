import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { env } from "./config.js";
import { Sentry } from "./observability.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerLeaderboardRoutes } from "./routes/leaderboards.js";
import { registerPlayerRoutes } from "./routes/players.js";
import { registerSoloRoutes } from "./routes/solo.js";

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function rateLimitKey(request: {
  headers: Record<string, string | string[] | undefined>;
  ip: string;
}) {
  const authorization = headerValue(request.headers.authorization);
  if (authorization) {
    return `user:${createHash("sha256").update(authorization).digest("hex")}`;
  }
  const client = headerValue(request.headers["x-rate-limit-client"]);
  const signature = headerValue(request.headers["x-rate-limit-signature"]);
  if (env.RATE_LIMIT_PROXY_SECRET && client && signature) {
    const expected = createHmac("sha256", env.RATE_LIMIT_PROXY_SECRET)
      .update(client)
      .digest("base64url");
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return `proxy:${client}`;
    }
  }
  return `ip:${request.ip}`;
}

export async function buildApp() {
  if (env.NODE_ENV === "production" && !env.RATE_LIMIT_PROXY_SECRET)
    throw new Error("RATE_LIMIT_PROXY_SECRET is required in production");
  const app = Fastify({
    logger: { level: env.NODE_ENV === "production" ? "info" : "debug" },
  });
  await app.register(sensible);
  app.setErrorHandler((error, request, reply) => {
    const reportedStatusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode <= 599
        ? error.statusCode
        : undefined;
    const statusCode =
      error instanceof ZodError
        ? 400
        : reportedStatusCode !== undefined
          ? reportedStatusCode
          : 500;
    if (statusCode >= 500) {
      Sentry.withScope((scope) => {
        scope.setTag("http.method", request.method);
        scope.setTag("http.route", request.routeOptions.url ?? request.url);
        Sentry.captureException(error);
      });
      request.log.error(error);
    }
    return reply.status(statusCode).send({
      error:
        statusCode === 500
          ? "Internal Server Error"
          : statusCode === 400
            ? "Invalid request"
            : statusCode === 503
              ? "Service unavailable"
              : error instanceof Error
                ? error.message
                : "Request failed",
    });
  });
  await app.register(cors, {
    origin: env.CORS_ORIGIN ?? false,
    credentials: true,
  });
  await app.register(rateLimit, { global: false, keyGenerator: rateLimitKey });
  await registerHealthRoutes(app);
  await registerPlayerRoutes(app);
  await registerAuthRoutes(app);
  await registerLeaderboardRoutes(app);
  await registerSoloRoutes(app);
  await app.register(registerAdminRoutes, { prefix: "/internal" });
  return app;
}
