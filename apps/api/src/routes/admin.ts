import type { FastifyInstance } from "fastify";
import { playerImportSchema } from "@valo-yiba/contracts";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../config.js";
import {
  countryGroups,
  playerAliases,
  playerSnapshots,
  players,
} from "../db/schema.js";
import { db } from "../db/client.js";
import { normalizeAlias } from "../lib/normalization.js";
import { upsertPlayerSnapshot } from "../services/player-import.js";

const reviewSchema = z.object({
  reviewStatus: z.enum(["approved", "rejected"]),
});

const listSchema = z.object({
  reviewStatus: z
    .enum(["pending_review", "approved", "rejected", "all"])
    .default("pending_review"),
});

const aliasSchema = z.object({ alias: z.string().trim().min(1).max(64) });
const statusSchema = z.object({ status: z.enum(["active", "disabled"]) });
const countryGroupSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,62}$/),
  displayName: z.string().trim().min(1).max(64),
  version: z.coerce.number().int().positive().default(1),
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

  app.get("/v1/admin/country-groups", async () => {
    return db.select().from(countryGroups).orderBy(asc(countryGroups.code));
  });

  app.put("/v1/admin/country-groups", async (request) => {
    const data = countryGroupSchema.parse(request.body);
    const [group] = await db
      .insert(countryGroups)
      .values(data)
      .onConflictDoUpdate({
        target: [countryGroups.code, countryGroups.version],
        set: { displayName: data.displayName },
      })
      .returning();
    return group;
  });

  app.get("/v1/admin/snapshots", async (request) => {
    const { reviewStatus } = listSchema.parse(request.query);
    const conditions = [];
    if (reviewStatus !== "all")
      conditions.push(eq(playerSnapshots.reviewStatus, reviewStatus));
    return db
      .select({
        snapshotId: playerSnapshots.id,
        playerId: players.id,
        canonicalName: players.canonicalName,
        playerStatus: players.status,
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
      .where(and(...conditions))
      .orderBy(asc(players.canonicalName))
      .limit(100);
  });

  app.get("/v1/admin/players/:playerId", async (request, reply) => {
    const { playerId } = z
      .object({ playerId: z.string().uuid() })
      .parse(request.params);
    const [player] = await db
      .select({
        id: players.id,
        canonicalName: players.canonicalName,
        status: players.status,
        snapshotId: playerSnapshots.id,
        countryCode: playerSnapshots.countryCode,
        countryGroup: playerSnapshots.countryGroupCode,
        region: playerSnapshots.region,
        primaryRole: playerSnapshots.primaryRole,
        currentOrLastTeam: playerSnapshots.currentOrLastTeam,
        championsTitles: playerSnapshots.championsTitles,
        mastersTitles: playerSnapshots.mastersTitles,
        heroTop3: playerSnapshots.heroTop3,
        dataAsOf: playerSnapshots.dataAsOf,
        sourceUrl: playerSnapshots.sourceUrl,
        sourceCheckedAt: playerSnapshots.sourceCheckedAt,
        reviewStatus: playerSnapshots.reviewStatus,
      })
      .from(players)
      .innerJoin(playerSnapshots, eq(playerSnapshots.playerId, players.id))
      .where(eq(players.id, playerId))
      .orderBy(desc(playerSnapshots.dataVersion))
      .limit(1);
    if (!player) return reply.notFound("Player not found");
    const aliases = await db
      .select({ id: playerAliases.id, alias: playerAliases.alias })
      .from(playerAliases)
      .where(eq(playerAliases.playerId, playerId))
      .orderBy(asc(playerAliases.alias));
    return { ...player, aliases };
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

  app.patch("/v1/admin/players/:playerId/status", async (request, reply) => {
    const { playerId } = z
      .object({ playerId: z.string().uuid() })
      .parse(request.params);
    const { status } = statusSchema.parse(request.body);
    const [player] = await db
      .update(players)
      .set({ status, updatedAt: new Date() })
      .where(eq(players.id, playerId))
      .returning({ id: players.id, status: players.status });
    if (!player) return reply.notFound("Player not found");
    return player;
  });

  app.get("/v1/admin/players/:playerId/aliases", async (request) => {
    const { playerId } = z
      .object({ playerId: z.string().uuid() })
      .parse(request.params);
    return db
      .select({ id: playerAliases.id, alias: playerAliases.alias })
      .from(playerAliases)
      .where(eq(playerAliases.playerId, playerId))
      .orderBy(asc(playerAliases.alias));
  });

  app.post("/v1/admin/players/:playerId/aliases", async (request, reply) => {
    const { playerId } = z
      .object({ playerId: z.string().uuid() })
      .parse(request.params);
    const { alias } = aliasSchema.parse(request.body);
    const [player] = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    if (!player) return reply.notFound("Player not found");
    const [created] = await db
      .insert(playerAliases)
      .values({ playerId, alias, normalizedAlias: normalizeAlias(alias) })
      .returning({ id: playerAliases.id, alias: playerAliases.alias });
    return reply.code(201).send(created);
  });

  app.delete(
    "/v1/admin/players/:playerId/aliases/:aliasId",
    async (request, reply) => {
      const { playerId, aliasId } = z
        .object({ playerId: z.string().uuid(), aliasId: z.string().uuid() })
        .parse(request.params);
      const [deleted] = await db
        .delete(playerAliases)
        .where(
          and(
            eq(playerAliases.id, aliasId),
            eq(playerAliases.playerId, playerId),
          ),
        )
        .returning({ id: playerAliases.id });
      if (!deleted) return reply.notFound("Alias not found");
      return reply.code(204).send();
    },
  );
}
