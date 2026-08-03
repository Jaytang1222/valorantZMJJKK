import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { playerImportSchema } from "@valo-yiba/contracts";
import { parse } from "csv-parse/sync";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { env } from "../config.js";
import {
  adminAuditLogs,
  contentReports,
  moderationActions,
  countryGroups,
  playerAliases,
  playerSnapshots,
  players,
  users,
} from "../db/schema.js";
import { db } from "../db/client.js";
import { normalizeAlias } from "../lib/normalization.js";
import { invalidateLeaderboard } from "../services/leaderboard.js";
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
const userRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
});
const reportResolutionSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  resolution: z.string().trim().min(1).max(4_000),
});
const moderationActionSchema = z.object({
  targetUserId: z.string().uuid(),
  action: z.enum(["hide_leaderboard", "void_scores", "restrict_account"]),
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
  return rows.map((row, index) => ({
    rowNumber: index + 2,
    data: playerImportSchema.safeParse({
      canonicalName: row.canonical_name,
      aliases: row.aliases?.split("|").filter(Boolean),
      countryCode: row.country_code,
      countryGroup: row.country_group,
      region: row.region,
      primaryRole: row.primary_role,
      currentOrLastTeam: row.current_or_last_team,
      isActiveRoster:
        row.is_active_roster === undefined
          ? true
          : row.is_active_roster === "true",
      isCoach: row.is_coach === "true",
      isFeaturedTeam: row.is_featured_team === "true",
      isVctCnTeam: row.is_vct_cn_team === "true",
      championsTitles: Number(row.champions_titles),
      mastersTitles: Number(row.masters_titles),
      heroTop3: row.hero_top_3?.split("|"),
      dataAsOf: row.data_as_of,
      sourceUrl: row.source_url,
      sourceCheckedAt: row.source_checked_at,
      reviewStatus: row.review_status,
    }),
  }));
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
      row.data.success ? [row.data.data] : [],
    );
    const names = valid.map((row) => row.canonicalName);
    const existing = names.length
      ? await db
          .select({ canonicalName: players.canonicalName })
          .from(players)
          .where(inArray(players.canonicalName, names))
      : [];
    const conflicts = existing.map((row) => ({
      canonicalName: row.canonicalName,
      resolution: "将创建新的资料快照",
    }));
    if (!input.apply || errors.length > 0) {
      return { preview: true, validRows: valid.length, errors, conflicts };
    }
    const imported = [];
    for (const player of valid)
      imported.push(await upsertPlayerSnapshot(player));
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

  app.get("/v1/admin/users", async () => {
    return db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt))
      .limit(100);
  });

  app.patch("/v1/admin/users/:userId/role", async (request, reply) => {
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(request.params);
    const { role } = userRoleSchema.parse(request.body);
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
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
