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
  // The directory is intentionally loaded in one request so its client-side
  // search covers the complete approved player set.
  limit: z.coerce.number().int().min(1).max(5000).default(5000),
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
      eq(playerSnapshots.isCoach, false),
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
      .select({
        id: players.id,
        canonicalName: players.canonicalName,
        countryCode: playerSnapshots.countryCode,
        region: playerSnapshots.region,
        primaryRole: playerSnapshots.primaryRole,
        currentOrLastTeam: playerSnapshots.currentOrLastTeam,
        rosterStatus: playerSnapshots.rosterStatus,
        isActiveRoster: playerSnapshots.isActiveRoster,
        dataAsOf: playerSnapshots.dataAsOf,
        aliases: sql<
          string[]
        >`coalesce(array_agg(distinct ${playerAliases.alias}) filter (where ${playerAliases.alias} is not null), '{}')`.as(
          "aliases",
        ),
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
      .groupBy(
        players.id,
        players.canonicalName,
        playerSnapshots.countryCode,
        playerSnapshots.region,
        playerSnapshots.primaryRole,
        playerSnapshots.currentOrLastTeam,
        playerSnapshots.rosterStatus,
        playerSnapshots.isActiveRoster,
        playerSnapshots.dataAsOf,
      )
      .orderBy(asc(players.canonicalName))
      .limit(query.limit);
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
        rosterStatus: playerSnapshots.rosterStatus,
        championsTitles: playerSnapshots.championsTitles,
        mastersTitles: playerSnapshots.mastersTitles,
        leagueTitles: playerSnapshots.leagueTitles,
        isActiveRoster: playerSnapshots.isActiveRoster,
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
          eq(playerSnapshots.isCoach, false),
        ),
      )
      .limit(1);

    if (!result[0]) return reply.notFound("Player not found");
    return result[0];
  });
}
