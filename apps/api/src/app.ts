import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { env } from "./config.js";
import { Sentry } from "./observability.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerPlayerRoutes } from "./routes/players.js";
import { registerSoloRoutes } from "./routes/solo.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "production" ? "info" : "debug" },
  });
  await app.register(sensible);
  app.setErrorHandler((error, request, reply) => {
    Sentry.withScope((scope) => {
      scope.setTag("http.method", request.method);
      scope.setTag("http.route", request.routeOptions.url ?? request.url);
      Sentry.captureException(error);
    });
    request.log.error(error);
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode < 500
        ? error.statusCode
        : 500;
    return reply.status(statusCode).send({
      error:
        statusCode === 500
          ? "Internal Server Error"
          : error instanceof Error
            ? error.message
            : "Request failed",
    });
  });
  await app.register(cors, {
    origin: env.CORS_ORIGIN ?? false,
    credentials: true,
  });
  await app.register(rateLimit, { global: false });
  await registerHealthRoutes(app);
  await registerPlayerRoutes(app);
  await registerAuthRoutes(app);
  await registerSoloRoutes(app);
  await app.register(registerAdminRoutes, { prefix: "/internal" });
  return app;
}
