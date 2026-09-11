import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { playerImportSchema } from "@valo-yiba/contracts";
import argon2 from "argon2";
import { parse } from "csv-parse/sync";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { env } from "../config.js";
import {
  adminAuditLogs,
  contentReports,
  guesses,
  moderationActions,
  countryGroups,
  playerAliases,
  playerSnapshots,
  players,
  roomParticipants,
  roomRounds,
  rooms,
  soloAttempts,
  users,
} from "../db/schema.js";
import { db } from "../db/client.js";
import { normalizeAlias } from "../lib/normalization.js";
import { DELETED_USER_DISPLAY_NAME, defaultName } from "./auth.js";
import { invalidateLeaderboard } from "../services/leaderboard.js";
import {
  PlayerCanonicalNameConflictError,
  PlayerSnapshotNotFoundError,
  updateLatestPlayerSnapshot,
  upsertPlayerSnapshot,
} from "../services/player-import.js";

const reviewSchema = z.object({
  reviewStatus: z.enum(["approved", "rejected"]),
});

const listSchema = z.object({
  view: z.enum(["published", "pending", "disabled", "all"]).optional(),
  reviewStatus: z
    .enum(["pending_review", "approved", "rejected", "all"])
    .default("pending_review"),
  region: z.enum(["americas", "emea", "pacific", "china"]).optional(),
  team: z.string().trim().min(1).max(128).optional(),
  q: z.string().trim().min(1).max(64).optional(),
  rosterStatus: z
    .enum(["active", "benched", "transferred", "retired", "inactive"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
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
const userRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
});
const userListSchema = z.object({
  q: z.string().trim().min(1).max(64).optional(),
  view: z.enum(["active", "deleted", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const createUserSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(20).optional(),
  role: z.enum(["user", "admin"]).default("user"),
});
const reportResolutionSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  resolution: z.string().trim().min(1).max(4_000),
});
const moderationActionSchema = z.object({
  targetUserId: z.string().uuid(),
  action: z.enum(["hide_leaderboard", "void_scores"]),
  reason: z.string().trim().min(1).max(4_000),
  actorUserId: z.string().uuid().optional(),
});
const csvImportSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  apply: z.boolean().default(false),
});

function parseCsvPlayers(csv: string) {
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
  return rows.map((row, index) => {
    const rawAge = row.age?.trim();
    return {
      rowNumber: index + 2,
      ageProvided: Boolean(rawAge),
      data: playerImportSchema.safeParse({
        canonicalName: row.canonical_name,
        aliases: row.aliases?.split("|").filter(Boolean),
        countryCode: row.country_code,
        countryGroup: row.country_group,
        age: rawAge ? Number(rawAge) : undefined,
        region: row.region,
        primaryRole: row.primary_role,
        roles: row.roles?.split("|").filter(Boolean),
        currentOrLastTeam: row.current_or_last_team,
        rosterStatus:
          row.roster_status ??
          (row.is_active_roster === "false" ? "retired" : "active"),
        isActiveRoster:
          row.is_active_roster === undefined
            ? true
            : row.is_active_roster === "true",
        isCoach: row.is_coach === "true",
        isFeaturedTeam: row.is_featured_team === "true",
        isVctCnTeam: row.is_vct_cn_team === "true",
        championsTitles: Number(row.champions_titles),
        mastersTitles: Number(row.masters_titles),
        leagueTitles: Number(row.league_titles),
        dataAsOf: row.data_as_of,
        sourceUrl: row.source_url,
        sourceCheckedAt: row.source_checked_at,
        reviewStatus: row.review_status,
      }),
    };
  });
}

async function audit(input: {
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(adminAuditLogs).values({
    ...input,
    metadata: input.metadata ?? {},
  });
}

function adminStats(
  row:
    | {
        totalScore: number | string;
        gamesPlayed: number | string;
        wins: number | string;
        totalGuesses: number | string;
      }
    | undefined,
) {
  if (!row) return null;
  const totalScore = Number(row.totalScore);
  const gamesPlayed = Number(row.gamesPlayed);
  const wins = Number(row.wins);
  const totalGuesses = Number(row.totalGuesses);
  return {
    totalScore,
    gamesPlayed,
    wins,
    totalGuesses,
    averageGuesses:
      gamesPlayed > 0 ? Number((totalGuesses / gamesPlayed).toFixed(2)) : 0,
    winRate: gamesPlayed > 0 ? Number((wins / gamesPlayed).toFixed(4)) : 0,
  };
}

async function hashPassword(password: string) {
  if (!env.PASSWORD_PEPPER)
    throw new Error("Password management is not configured");
  return argon2.hash(`${password}${env.PASSWORD_PEPPER}`, {
    type: argon2.argon2id,
  });
}

function hasValidInternalSecret(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return false;
  const expected = Buffer.from(env.INTERNAL_API_SECRET);
  const actual = Buffer.from(value);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (!hasValidInternalSecret(request.headers["x-internal-api-secret"])) {
      return reply.unauthorized("Invalid internal API secret");
    }
  });

  app.post("/v1/admin/players", async (request, reply) => {
    const player = playerImportSchema.parse(request.body);
    const result = await upsertPlayerSnapshot(player);
    await audit({
      action: "player_snapshot_created",
      entityType: "player",
      entityId: result.playerId,
      metadata: { snapshotId: result.snapshotId },
    });
    return reply.code(201).send(result);
  });

  app.patch("/v1/admin/players/:playerId", async (request, reply) => {
    const { playerId } = z
      .object({ playerId: z.string().uuid() })
      .parse(request.params);
    const player = playerImportSchema.parse(request.body);
    try {
      const result = await updateLatestPlayerSnapshot(playerId, player);
      await audit({
        action: "player_snapshot_updated",
        entityType: "player",
        entityId: result.playerId,
        metadata: { snapshotId: result.snapshotId },
      });
      return result;
    } catch (error) {
      if (error instanceof PlayerCanonicalNameConflictError)
        return reply.conflict(error.message);
      if (error instanceof PlayerSnapshotNotFoundError)
        return reply.notFound(error.message);
      throw error;
    }
  });

  app.post("/v1/admin/players/import", async (request, reply) => {
    const input = csvImportSchema.parse(request.body);
    const parsed = parseCsvPlayers(input.csv);
    const errors = parsed.flatMap((row) =>
      row.data.success
        ? []
        : [
            {
              row: row.rowNumber,
              errors: row.data.error.issues.map((issue) => issue.message),
            },
          ],
    );
    const valid = parsed.flatMap((row) =>
      row.data.success
        ? [{ player: row.data.data, ageProvided: row.ageProvided }]
        : [],
    );
    const names = valid.map(({ player }) => player.canonicalName);
    const normalizedNames = [
      ...new Set(names.map((name) => name.toLowerCase())),
    ];
    const existing = normalizedNames.length
      ? await db
          .select({ canonicalName: players.canonicalName })
          .from(players)
          .where(inArray(sql`lower(${players.canonicalName})`, normalizedNames))
      : [];
    const conflicts = existing.map((row) => ({
      canonicalName: row.canonicalName,
      resolution: "updates the player with a new pending snapshot",
    }));
    if (!input.apply || errors.length > 0) {
      return { preview: true, validRows: valid.length, errors, conflicts };
    }
    const imported = [];
    for (const { player, ageProvided } of valid)
      imported.push(
        await upsertPlayerSnapshot(player, {
          preserveExistingAge: !ageProvided,
        }),
      );
    await audit({
      action: "players_csv_imported",
      entityType: "player_import",
      entityId: new Date().toISOString(),
      metadata: { imported: imported.length, conflicts: conflicts.length },
    });
    return reply.code(201).send({ preview: false, imported, conflicts });
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
    await audit({
      action: "country_group_upserted",
      entityType: "country_group",
      entityId: group.id,
      metadata: { code: group.code, version: group.version },
    });
    return group;
  });

  app.get("/v1/admin/snapshots", async (request) => {
    const { view, reviewStatus, region, team, q, rosterStatus, page, limit } =
      listSchema.parse(request.query);
    const latestSnapshots = db
      .select({
        playerId: playerSnapshots.playerId,
        dataVersion: sql<number>`max(${playerSnapshots.dataVersion})`.as(
          "latest_data_version",
        ),
      })
      .from(playerSnapshots)
      .groupBy(playerSnapshots.playerId)
      .as("latest_player_snapshots");
    const filterConditions = [];
    if (region) filterConditions.push(eq(playerSnapshots.region, region));
    if (team)
      filterConditions.push(
        ilike(playerSnapshots.currentOrLastTeam, `%${team}%`),
      );
    if (rosterStatus)
      filterConditions.push(eq(playerSnapshots.rosterStatus, rosterStatus));
    if (q)
      filterConditions.push(
        or(
          ilike(players.canonicalName, `%${q}%`),
          ilike(playerAliases.alias, `%${q}%`),
        )!,
      );
    const viewConditions = view
      ? view === "published"
        ? [
            eq(players.status, "active"),
            eq(playerSnapshots.reviewStatus, "approved"),
          ]
        : view === "pending"
          ? [
              inArray(playerSnapshots.reviewStatus, [
                "pending_review",
                "rejected",
              ]),
            ]
          : view === "disabled"
            ? [eq(players.status, "disabled")]
            : []
      : reviewStatus === "all"
        ? []
        : [eq(playerSnapshots.reviewStatus, reviewStatus)];
    const conditions = [...filterConditions, ...viewConditions];
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const rowsQuery = db
      .select({
        snapshotId: playerSnapshots.id,
        playerId: players.id,
        canonicalName: players.canonicalName,
        playerStatus: players.status,
        reviewStatus: playerSnapshots.reviewStatus,
        region: playerSnapshots.region,
        countryCode: playerSnapshots.countryCode,
        age: playerSnapshots.age,
        primaryRole: playerSnapshots.primaryRole,
        roles: playerSnapshots.playerRoles,
        currentOrLastTeam: playerSnapshots.currentOrLastTeam,
        rosterStatus: playerSnapshots.rosterStatus,
        isActiveRoster: playerSnapshots.isActiveRoster,
        championsTitles: playerSnapshots.championsTitles,
        mastersTitles: playerSnapshots.mastersTitles,
        leagueTitles: playerSnapshots.leagueTitles,
        dataAsOf: playerSnapshots.dataAsOf,
        sourceUrl: playerSnapshots.sourceUrl,
        sourceCheckedAt: playerSnapshots.sourceCheckedAt,
      })
      .from(playerSnapshots)
      .innerJoin(players, eq(players.id, playerSnapshots.playerId))
      .innerJoin(
        latestSnapshots,
        and(
          eq(latestSnapshots.playerId, playerSnapshots.playerId),
          eq(latestSnapshots.dataVersion, playerSnapshots.dataVersion),
        ),
      )
      .leftJoin(playerAliases, eq(playerAliases.playerId, players.id))
      .where(whereClause)
      .groupBy(
        playerSnapshots.id,
        players.id,
        players.canonicalName,
        players.status,
        playerSnapshots.reviewStatus,
        playerSnapshots.region,
        playerSnapshots.countryCode,
        playerSnapshots.age,
        playerSnapshots.primaryRole,
        playerSnapshots.playerRoles,
        playerSnapshots.currentOrLastTeam,
        playerSnapshots.rosterStatus,
        playerSnapshots.isActiveRoster,
        playerSnapshots.championsTitles,
        playerSnapshots.mastersTitles,
        playerSnapshots.leagueTitles,
        playerSnapshots.dataAsOf,
        playerSnapshots.sourceUrl,
        playerSnapshots.sourceCheckedAt,
      )
      .orderBy(asc(players.canonicalName))
      .limit(limit)
      .offset((page - 1) * limit);
    const totalQuery = db
      .select({ total: sql<number>`count(distinct ${players.id})` })
      .from(playerSnapshots)
      .innerJoin(players, eq(players.id, playerSnapshots.playerId))
      .innerJoin(
        latestSnapshots,
        and(
          eq(latestSnapshots.playerId, playerSnapshots.playerId),
          eq(latestSnapshots.dataVersion, playerSnapshots.dataVersion),
        ),
      )
      .leftJoin(playerAliases, eq(playerAliases.playerId, players.id))
      .where(whereClause);
    const [items, totalResult] = await Promise.all([rowsQuery, totalQuery]);
    const total = Number(totalResult[0]?.total ?? 0);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  });

  app.get("/v1/admin/players/export", async (request, reply) => {
    const latestSnapshots = db
      .select({
        playerId: playerSnapshots.playerId,
        dataVersion: sql<number>`max(${playerSnapshots.dataVersion})`.as(
          "latest_data_version",
        ),
      })
      .from(playerSnapshots)
      .groupBy(playerSnapshots.playerId)
      .as("latest_player_snapshots_export");
    const rows = await db
      .select({
        canonicalName: players.canonicalName,
        aliases: sql<
          string[]
        >`coalesce(array_agg(distinct ${playerAliases.alias}) filter (where ${playerAliases.alias} is not null), '{}')`,
        countryCode: playerSnapshots.countryCode,
        countryGroup: playerSnapshots.countryGroupCode,
        age: playerSnapshots.age,
        region: playerSnapshots.region,
        primaryRole: playerSnapshots.primaryRole,
        roles: playerSnapshots.playerRoles,
        currentOrLastTeam: playerSnapshots.currentOrLastTeam,
        rosterStatus: playerSnapshots.rosterStatus,
        isActiveRoster: playerSnapshots.isActiveRoster,
        isCoach: playerSnapshots.isCoach,
        isFeaturedTeam: playerSnapshots.isFeaturedTeam,
        isVctCnTeam: playerSnapshots.isVctCnTeam,
        championsTitles: playerSnapshots.championsTitles,
        mastersTitles: playerSnapshots.mastersTitles,
        leagueTitles: playerSnapshots.leagueTitles,
        dataAsOf: playerSnapshots.dataAsOf,
        sourceUrl: playerSnapshots.sourceUrl,
        sourceCheckedAt: playerSnapshots.sourceCheckedAt,
        reviewStatus: playerSnapshots.reviewStatus,
        playerStatus: players.status,
        dataVersion: playerSnapshots.dataVersion,
      })
      .from(players)
      .innerJoin(playerSnapshots, eq(playerSnapshots.playerId, players.id))
      .innerJoin(
        latestSnapshots,
        and(
          eq(latestSnapshots.playerId, playerSnapshots.playerId),
          eq(latestSnapshots.dataVersion, playerSnapshots.dataVersion),
        ),
      )
      .leftJoin(playerAliases, eq(playerAliases.playerId, players.id))
      .groupBy(
        players.id,
        players.canonicalName,
        players.status,
        playerSnapshots.id,
        playerSnapshots.countryCode,
        playerSnapshots.countryGroupCode,
        playerSnapshots.age,
        playerSnapshots.region,
        playerSnapshots.primaryRole,
        playerSnapshots.playerRoles,
        playerSnapshots.currentOrLastTeam,
        playerSnapshots.rosterStatus,
        playerSnapshots.isActiveRoster,
        playerSnapshots.isCoach,
        playerSnapshots.isFeaturedTeam,
        playerSnapshots.isVctCnTeam,
        playerSnapshots.championsTitles,
        playerSnapshots.mastersTitles,
        playerSnapshots.leagueTitles,
        playerSnapshots.dataAsOf,
        playerSnapshots.sourceUrl,
        playerSnapshots.sourceCheckedAt,
        playerSnapshots.reviewStatus,
        playerSnapshots.dataVersion,
      )
      .orderBy(asc(players.canonicalName));
    const headers = [
      "canonical_name",
      "aliases",
      "country_code",
      "country_group",
      "age",
      "region",
      "primary_role",
      "roles",
      "current_or_last_team",
      "roster_status",
      "is_active_roster",
      "is_coach",
      "is_featured_team",
      "is_vct_cn_team",
      "champions_titles",
      "masters_titles",
      "league_titles",
      "data_as_of",
      "source_url",
      "source_checked_at",
      "review_status",
      "player_status",
      "data_version",
    ];
    const escape = (value: unknown) => {
      const text =
        value instanceof Date ? value.toISOString() : String(value ?? "");
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        [
          row.canonicalName,
          row.aliases.join("|"),
          row.countryCode,
          row.countryGroup,
          row.age,
          row.region,
          row.primaryRole,
          (row.roles ?? [row.primaryRole]).join("|"),
          row.currentOrLastTeam,
          row.rosterStatus,
          row.isActiveRoster,
          row.isCoach,
          row.isFeaturedTeam,
          row.isVctCnTeam,
          row.championsTitles,
          row.mastersTitles,
          row.leagueTitles,
          row.dataAsOf,
          row.sourceUrl,
          row.sourceCheckedAt,
          row.reviewStatus,
          row.playerStatus,
          row.dataVersion,
        ]
          .map(escape)
          .join(","),
      ),
    ].join("\r\n");
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="players.csv"')
      .send(`\ufeff${csv}\r\n`);
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
        age: playerSnapshots.age,
        region: playerSnapshots.region,
        primaryRole: playerSnapshots.primaryRole,
        roles: playerSnapshots.playerRoles,
        currentOrLastTeam: playerSnapshots.currentOrLastTeam,
        rosterStatus: playerSnapshots.rosterStatus,
        isActiveRoster: playerSnapshots.isActiveRoster,
        championsTitles: playerSnapshots.championsTitles,
        mastersTitles: playerSnapshots.mastersTitles,
        leagueTitles: playerSnapshots.leagueTitles,
        isCoach: playerSnapshots.isCoach,
        isFeaturedTeam: playerSnapshots.isFeaturedTeam,
        isVctCnTeam: playerSnapshots.isVctCnTeam,
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
      await audit({
        action: "player_snapshot_reviewed",
        entityType: "player_snapshot",
        entityId: snapshot.id,
        metadata: { reviewStatus },
      });
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
    await audit({
      action: "player_status_changed",
      entityType: "player",
      entityId: player.id,
      metadata: { status },
    });
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
    await audit({
      action: "player_alias_added",
      entityType: "player_alias",
      entityId: created.id,
      metadata: { playerId, alias: created.alias },
    });
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
      await audit({
        action: "player_alias_removed",
        entityType: "player_alias",
        entityId: deleted.id,
        metadata: { playerId },
      });
      return reply.code(204).send();
    },
  );

  app.get("/v1/admin/users", async (request) => {
    const input = userListSchema.parse(request.query);
    const statusCondition =
      input.view === "active"
        ? isNull(users.deletedAt)
        : input.view === "deleted"
          ? isNotNull(users.deletedAt)
          : undefined;
    const conditions = and(
      statusCondition,
      input.q
        ? or(
            ilike(users.displayName, `%${input.q}%`),
            ilike(users.email, `%${input.q}%`),
          )
        : undefined,
    );
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(conditions);
    const offset = (input.page - 1) * input.limit;
    const rows = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(conditions)
      .orderBy(desc(users.createdAt), asc(users.normalizedDisplayName))
      .limit(input.limit)
      .offset(offset);
    const ids = rows.map((row) => row.id);
    const [soloRows, versusRows] = ids.length
      ? await Promise.all([
          db
            .select({
              userId: soloAttempts.userId,
              totalScore: sql<number>`coalesce(sum(${soloAttempts.score}), 0)::int`,
              gamesPlayed: sql<number>`count(*)::int`,
              wins: sql<number>`count(*) filter (where ${soloAttempts.status} = 'won')::int`,
              totalGuesses: sql<number>`coalesce(sum(${soloAttempts.guessCount}), 0)::int`,
            })
            .from(soloAttempts)
            .where(
              and(
                inArray(soloAttempts.userId, ids),
                inArray(soloAttempts.status, ["won", "lost"]),
              ),
            )
            .groupBy(soloAttempts.userId),
          db
            .select({
              userId: roomParticipants.userId,
              totalScore: sql<number>`count(distinct ${rooms.id}) filter (where ${rooms.winnerUserId} = ${roomParticipants.userId})::int`,
              gamesPlayed: sql<number>`count(distinct ${rooms.id})::int`,
              wins: sql<number>`count(distinct ${rooms.id}) filter (where ${rooms.winnerUserId} = ${roomParticipants.userId})::int`,
              totalGuesses: sql<number>`count(${guesses.id})::int`,
            })
            .from(roomParticipants)
            .innerJoin(rooms, eq(rooms.id, roomParticipants.roomId))
            .leftJoin(
              roomRounds,
              and(
                eq(roomRounds.roomId, rooms.id),
                eq(roomRounds.roundNumber, 1),
              ),
            )
            .leftJoin(
              guesses,
              and(
                eq(guesses.roomRoundId, roomRounds.id),
                eq(guesses.userId, roomParticipants.userId),
              ),
            )
            .where(
              and(
                inArray(roomParticipants.userId, ids),
                isNotNull(rooms.finishedAt),
                isNotNull(rooms.winnerUserId),
              ),
            )
            .groupBy(roomParticipants.userId),
        ])
      : [[], []];
    const soloByUser = new Map(
      soloRows.map((row) => [row.userId, adminStats(row)]),
    );
    const versusByUser = new Map(
      versusRows.map((row) => [row.userId, adminStats(row)]),
    );
    return {
      items: rows.map((row) => ({
        ...row,
        displayName: row.deletedAt
          ? DELETED_USER_DISPLAY_NAME
          : row.displayName,
        stats: {
          solo: soloByUser.get(row.id) ?? null,
          versus: versusByUser.get(row.id) ?? null,
        },
      })),
      total: Number(total),
      page: input.page,
      limit: input.limit,
      totalPages: Math.max(1, Math.ceil(Number(total) / input.limit)),
    };
  });

  app.post("/v1/admin/users", async (request, reply) => {
    const input = createUserSchema.parse(request.body);
    const email = normalizeAlias(input.email);
    if (!env.PASSWORD_PEPPER)
      return reply.serviceUnavailable("Password management is not configured");
    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.normalizedEmail, email))
      .limit(1);
    if (existingEmail)
      return reply.conflict("This email is already registered");
    const displayName = input.displayName ?? (await defaultName());
    const normalizedDisplayName = normalizeAlias(displayName);
    const [existingName] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.normalizedDisplayName, normalizedDisplayName))
      .limit(1);
    if (existingName)
      return reply.conflict("This display name is already used");
    const passwordHash = await hashPassword(input.password);
    const [user] = await db
      .insert(users)
      .values({
        displayName,
        normalizedDisplayName,
        email: input.email.trim(),
        normalizedEmail: email,
        passwordHash,
        role: input.role,
      })
      .returning({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
      });
    await audit({
      action: "user_created",
      entityType: "user",
      entityId: user.id,
      metadata: { role: user.role },
    });
    return reply.code(201).send(user);
  });

  app.post("/v1/admin/users/:userId/password-reset", async (request, reply) => {
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(request.params);
    if (!env.PASSWORD_PEPPER)
      return reply.serviceUnavailable("Password management is not configured");
    const [target] = await db
      .select({ id: users.id, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!target) return reply.notFound("User not found");
    if (target.deletedAt)
      return reply.conflict("A deleted user cannot receive a password reset");
    const [user] = await db
      .update(users)
      .set({
        passwordHash: await hashPassword("123456"),
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning({ id: users.id });
    if (!user) return reply.notFound("User not found");
    await audit({
      action: "user_password_reset",
      entityType: "user",
      entityId: user.id,
      metadata: { temporary: true },
    });
    return { id: user.id, temporaryPassword: "123456" };
  });

  app.delete("/v1/admin/users/:userId", async (request, reply) => {
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(request.params);
    const [target] = await db
      .select({ id: users.id, role: users.role, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!target) return reply.notFound("User not found");
    if (target.deletedAt) return { id: target.id, deletedAt: target.deletedAt };
    const deletedAt = new Date();
    const anonymizedName = `${DELETED_USER_DISPLAY_NAME}#${target.id
      .slice(0, 6)
      .toUpperCase()}`;
    const [user] = await db
      .update(users)
      .set({
        displayName: anonymizedName,
        normalizedDisplayName: normalizeAlias(anonymizedName),
        email: null,
        normalizedEmail: null,
        passwordHash: null,
        role: "user",
        deletedAt,
        updatedAt: deletedAt,
      })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning({ id: users.id, deletedAt: users.deletedAt });
    if (!user) {
      // A concurrent request may have anonymized the same account between
      // the initial read and this conditional update. Treat that race as the
      // same idempotent success as a request that observed deletedAt first.
      const [alreadyDeleted] = await db
        .select({ id: users.id, deletedAt: users.deletedAt })
        .from(users)
        .where(and(eq(users.id, userId), isNotNull(users.deletedAt)))
        .limit(1);
      if (alreadyDeleted) return alreadyDeleted;
      return reply.notFound("User not found");
    }
    await audit({
      action: "user_anonymized",
      entityType: "user",
      entityId: user.id,
      metadata: { deletedAt: deletedAt.toISOString() },
    });
    await Promise.all([
      invalidateLeaderboard("solo"),
      invalidateLeaderboard("versus"),
    ]);
    return { id: user.id, deletedAt: user.deletedAt };
  });

  app.patch("/v1/admin/users/:userId/role", async (request, reply) => {
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(request.params);
    const { role } = userRoleSchema.parse(request.body);
    const [target] = await db
      .select({ id: users.id, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!target) return reply.notFound("User not found");
    if (target.deletedAt)
      return reply.conflict("A deleted user cannot change roles");
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning({ id: users.id, role: users.role });
    if (!user) return reply.notFound("User not found");
    await audit({
      action: "user_role_changed",
      entityType: "user",
      entityId: user.id,
      metadata: { role },
    });
    return user;
  });

  app.get("/v1/admin/reports", async (request) => {
    const status = z
      .object({
        status: z
          .enum(["open", "resolved", "dismissed", "all"])
          .default("open"),
      })
      .parse(request.query).status;
    const query = db
      .select({
        id: contentReports.id,
        category: contentReports.category,
        subject: contentReports.subject,
        details: contentReports.details,
        status: contentReports.status,
        reporterUserId: contentReports.reporterUserId,
        reviewerUserId: contentReports.reviewerUserId,
        resolution: contentReports.resolution,
        createdAt: contentReports.createdAt,
        resolvedAt: contentReports.resolvedAt,
      })
      .from(contentReports)
      .orderBy(desc(contentReports.createdAt))
      .limit(100);
    return status === "all"
      ? query
      : query.where(eq(contentReports.status, status));
  });

  app.patch("/v1/admin/reports/:reportId", async (request, reply) => {
    const { reportId } = z
      .object({ reportId: z.string().uuid() })
      .parse(request.params);
    const input = reportResolutionSchema.parse(request.body);
    const [report] = await db
      .update(contentReports)
      .set({
        status: input.status,
        resolution: input.resolution,
        resolvedAt: new Date(),
      })
      .where(eq(contentReports.id, reportId))
      .returning({ id: contentReports.id, status: contentReports.status });
    if (!report) return reply.notFound("Report not found");
    await audit({
      action: "report_resolved",
      entityType: "report",
      entityId: report.id,
      metadata: input,
    });
    return report;
  });

  app.get("/v1/admin/moderation-actions", async () => {
    return db
      .select({
        id: moderationActions.id,
        targetUserId: moderationActions.targetUserId,
        action: moderationActions.action,
        reason: moderationActions.reason,
        active: moderationActions.active,
        actorUserId: moderationActions.actorUserId,
        createdAt: moderationActions.createdAt,
        revokedAt: moderationActions.revokedAt,
      })
      .from(moderationActions)
      .where(
        inArray(moderationActions.action, ["hide_leaderboard", "void_scores"]),
      )
      .orderBy(desc(moderationActions.createdAt))
      .limit(100);
  });

  app.post("/v1/admin/moderation-actions", async (request, reply) => {
    const input = moderationActionSchema.parse(request.body);
    const [action] = await db
      .insert(moderationActions)
      .values(input)
      .returning({
        id: moderationActions.id,
        action: moderationActions.action,
      });
    await audit({
      actorUserId: input.actorUserId,
      action: "moderation_action_created",
      entityType: "moderation_action",
      entityId: action.id,
      metadata: { targetUserId: input.targetUserId, action: input.action },
    });
    if (input.action === "hide_leaderboard" || input.action === "void_scores") {
      await Promise.all([
        invalidateLeaderboard("solo"),
        invalidateLeaderboard("versus"),
      ]);
    }
    return reply.code(201).send(action);
  });

  app.patch(
    "/v1/admin/moderation-actions/:actionId/revoke",
    async (request, reply) => {
      const { actionId } = z
        .object({ actionId: z.string().uuid() })
        .parse(request.params);
      const [action] = await db
        .update(moderationActions)
        .set({ active: false, revokedAt: new Date() })
        .where(eq(moderationActions.id, actionId))
        .returning({
          id: moderationActions.id,
          action: moderationActions.action,
        });
      if (!action) return reply.notFound("Moderation action not found");
      await audit({
        action: "moderation_action_revoked",
        entityType: "moderation_action",
        entityId: action.id,
      });
      if (
        action.action === "hide_leaderboard" ||
        action.action === "void_scores"
      ) {
        await Promise.all([
          invalidateLeaderboard("solo"),
          invalidateLeaderboard("versus"),
        ]);
      }
      return action;
    },
  );
}
