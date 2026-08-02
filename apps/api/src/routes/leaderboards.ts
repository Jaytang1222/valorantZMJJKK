import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAccountSummary, getLeaderboard } from "../services/leaderboard.js";
import { verifySession } from "./auth.js";

const leaderboardQuery = z.object({
  mode: z.enum(["solo", "versus"]),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function bearer(header: string | undefined) {
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

export async function registerLeaderboardRoutes(app: FastifyInstance) {
  app.get("/v1/leaderboards", async (request) => {
    const query = leaderboardQuery.parse(request.query);
    return getLeaderboard({
      ...query,
      userId: verifySession(bearer(request.headers.authorization)),
    });
  });

  app.get("/v1/account/summary", async (request, reply) => {
    const userId = verifySession(bearer(request.headers.authorization));
    if (!userId) return reply.unauthorized("Authentication is required");
    return getAccountSummary(userId);
  });
}
