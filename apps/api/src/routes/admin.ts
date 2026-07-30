import type { FastifyInstance } from "fastify";
import { playerImportSchema } from "@valo-yiba/contracts";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../config.js";
import { playerSnapshots, players } from "../db/schema.js";
import { db } from "../db/client.js";
import { upsertPlayerSnapshot } from "../services/player-import.js";

const reviewSchema = z.object({
  reviewStatus: z.enum(["approved", "rejected"]),
});

const listSchema = z.object({
  reviewStatus: z
    .enum(["pending_review", "approved", "rejected"])
    .default("pending_review"),
});

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (request.headers["x-internal-api-secret"] !== env.INTERNAL_API_SECRET) {
      return reply.unauthorized("Invalid internal API secret");
    }
  });

  app.post("/v1/admin/players", async (request, reply) => {
    const player = playerImportSchema.parse(request.body);
    const result = await upsertPlayerSnapshot(player);
    return reply.code(201).send(result);
  });

  app.get("/v1/admin/snapshots", async (request) => {
    const { reviewStatus } = listSchema.parse(request.query);
    return db
      .select({
        snapshotId: playerSnapshots.id,
        playerId: players.id,
        canonicalName: players.canonicalName,
        reviewStatus: playerSnapshots.reviewStatus,
        region: playerSnapshots.region,
        countryCode: playerSnapshots.countryCode,
        primaryRole: playerSnapshots.primaryRole,
        currentOrLastTeam: playerSnapshots.currentOrLastTeam,
        championsTitles: playerSnapshots.championsTitles,
        mastersTitles: playerSnapshots.mastersTitles,
        heroTop3: playerSnapshots.heroTop3,
        dataAsOf: playerSnapshots.dataAsOf,
        sourceUrl: playerSnapshots.sourceUrl,
        sourceCheckedAt: playerSnapshots.sourceCheckedAt,
      })
      .from(playerSnapshots)
      .innerJoin(players, eq(players.id, playerSnapshots.playerId))
      .where(
        and(
          eq(playerSnapshots.reviewStatus, reviewStatus),
          eq(players.status, "active"),
        ),
      )
      .orderBy(asc(players.canonicalName))
      .limit(100);
  });

  app.patch(
    "/v1/admin/snapshots/:snapshotId/review",
    async (request, reply) => {
      const { snapshotId } = z
        .object({ snapshotId: z.string().uuid() })
        .parse(request.params);
      const { reviewStatus } = reviewSchema.parse(request.body);
      const [snapshot] = await db
        .update(playerSnapshots)
        .set({ reviewStatus })
        .where(eq(playerSnapshots.id, snapshotId))
        .returning({
          id: playerSnapshots.id,
          reviewStatus: playerSnapshots.reviewStatus,
        });

      if (!snapshot) return reply.notFound("Snapshot not found");
      return snapshot;
    },
  );
}
