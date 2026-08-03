import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getAccountSummary,
  getPublicVersusProfile,
} from "../services/leaderboard.js";
import { verifySession } from "./auth.js";

function bearer(header: string | undefined) {
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

export async function registerLeaderboardRoutes(app: FastifyInstance) {
  app.get("/v1/leaderboards", async (_request, reply) => {
    return reply.serviceUnavailable("Versus leaderboard is coming soon");
  });

  app.get("/v1/account/summary", async (request, reply) => {
    const userId = verifySession(bearer(request.headers.authorization));
    if (!userId) return reply.unauthorized("Authentication is required");
    return getAccountSummary(userId);
  });

  app.get("/v1/profiles/:userId/versus", async (request, reply) => {
    if (!verifySession(bearer(request.headers.authorization)))
      return reply.unauthorized("Authentication is required");
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(request.params);
    const profile = await getPublicVersusProfile(userId);
    if (!profile) return reply.notFound("Player profile was not found");
    return profile;
  });
}
