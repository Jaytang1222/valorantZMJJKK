import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { env } from "./config.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerPlayerRoutes } from "./routes/players.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "production" ? "info" : "debug" },
  });
  await app.register(sensible);
  await app.register(cors, {
    origin: env.CORS_ORIGIN ?? false,
    credentials: true,
  });
  await registerHealthRoutes(app);
  await registerPlayerRoutes(app);
  await app.register(registerAdminRoutes, { prefix: "/internal" });
  return app;
}
