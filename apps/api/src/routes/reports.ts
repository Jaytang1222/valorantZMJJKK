import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { contentReports } from "../db/schema.js";
import { verifySession } from "./auth.js";

const reportSchema = z.object({
  category: z.enum(["player_data", "abuse", "other"]),
  subject: z.string().trim().min(1).max(128),
  details: z.string().trim().min(10).max(4_000),
});

function bearer(header: string | undefined) {
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

export async function registerReportRoutes(app: FastifyInstance) {
  app.post(
    "/v1/reports",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const input = reportSchema.parse(request.body);
      const reporterUserId = verifySession(
        bearer(request.headers.authorization),
      );
      const [report] = await db
        .insert(contentReports)
        .values({ ...input, reporterUserId })
        .returning({
          id: contentReports.id,
          createdAt: contentReports.createdAt,
        });
      return reply.code(201).send({ report });
    },
  );
}
