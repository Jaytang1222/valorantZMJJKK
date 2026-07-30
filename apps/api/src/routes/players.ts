import type { FastifyInstance } from "fastify";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { playerAliases, players, playerSnapshots } from "../db/schema.js";
import { db } from "../db/client.js";

const playerSearchSchema = z.object({
  q: z.string().trim().min(1).max(64).optional(),
  region: z.enum(["americas", "emea", "pacific", "china"]).optional(),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  role: z
    .enum(["duelist", "initiator", "controller", "sentinel", "flex"])
    .optional(),
  team: z.string().trim().min(1).max(128).optional(),
});

export async function registerPlayerRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/v1/players", async (request) => {
    const query = playerSearchSchema.parse(request.query);
    const latestApprovedSnapshots = db
      .select({
        playerId: playerSnapshots.playerId,
        dataVersion: sql<number>`max(${playerSnapshots.dataVersion})`.as(
          "latest_data_version",
        ),
      })
      .from(playerSnapshots)
      .where(eq(playerSnapshots.reviewStatus, "approved"))
      .groupBy(playerSnapshots.playerId)
      .as("latest_approved_snapshots");
    const conditions = [
      eq(players.status, "active"),
      eq(playerSnapshots.reviewStatus, "approved"),
    ];

    if (query.region) conditions.push(eq(playerSnapshots.region, query.region));
    if (query.countryCode)
      conditions.push(eq(playerSnapshots.countryCode, query.countryCode));
    if (query.role)
      conditions.push(eq(playerSnapshots.primaryRole, query.role));
    if (query.team)
      conditions.push(
        ilike(playerSnapshots.currentOrLastTeam, `%${query.team}%`),
      );
    if (query.q) {
      conditions.push(
        or(
          ilike(players.canonicalName, `%${query.q}%`),
          ilike(playerAliases.alias, `%${query.q}%`),
        )!,
      );
    }

    return db
      .selectDistinct({
        id: players.id,
        canonicalName: players.canonicalName,
        countryCode: playerSnapshots.countryCode,
        region: playerSnapshots.region,
        primaryRole: playerSnapshots.primaryRole,
        currentOrLastTeam: playerSnapshots.currentOrLastTeam,
        dataAsOf: playerSnapshots.dataAsOf,
      })
      .from(players)
      .innerJoin(playerSnapshots, eq(playerSnapshots.playerId, players.id))
      .innerJoin(
        latestApprovedSnapshots,
        and(
          eq(latestApprovedSnapshots.playerId, playerSnapshots.playerId),
          eq(latestApprovedSnapshots.dataVersion, playerSnapshots.dataVersion),
        ),
      )
      .leftJoin(playerAliases, eq(playerAliases.playerId, players.id))
      .where(and(...conditions))
      .orderBy(asc(players.canonicalName))
      .limit(50);
  });

  app.get("/v1/players/:playerId", async (request, reply) => {
    const { playerId } = z
      .object({ playerId: z.string().uuid() })
      .parse(request.params);
    const latestApprovedSnapshots = db
      .select({
        playerId: playerSnapshots.playerId,
        dataVersion: sql<number>`max(${playerSnapshots.dataVersion})`.as(
          "latest_data_version",
        ),
      })
      .from(playerSnapshots)
      .where(eq(playerSnapshots.reviewStatus, "approved"))
      .groupBy(playerSnapshots.playerId)
      .as("latest_approved_snapshots");
    const result = await db
      .select({
        id: players.id,
        canonicalName: players.canonicalName,
        countryCode: playerSnapshots.countryCode,
        countryGroupCode: playerSnapshots.countryGroupCode,
        region: playerSnapshots.region,
        primaryRole: playerSnapshots.primaryRole,
        currentOrLastTeam: playerSnapshots.currentOrLastTeam,
        championsTitles: playerSnapshots.championsTitles,
        mastersTitles: playerSnapshots.mastersTitles,
        heroTop3: playerSnapshots.heroTop3,
        dataAsOf: playerSnapshots.dataAsOf,
        sourceUrl: playerSnapshots.sourceUrl,
        sourceCheckedAt: playerSnapshots.sourceCheckedAt,
      })
      .from(players)
      .innerJoin(playerSnapshots, eq(playerSnapshots.playerId, players.id))
      .innerJoin(
        latestApprovedSnapshots,
        and(
          eq(latestApprovedSnapshots.playerId, playerSnapshots.playerId),
          eq(latestApprovedSnapshots.dataVersion, playerSnapshots.dataVersion),
        ),
      )
      .where(
        and(
          eq(players.id, playerId),
          eq(players.status, "active"),
          eq(playerSnapshots.reviewStatus, "approved"),
        ),
      )
      .limit(1);

    if (!result[0]) return reply.notFound("Player not found");
    return result[0];
  });
}
