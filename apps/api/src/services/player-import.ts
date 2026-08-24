import type { PlayerImport } from "@valo-yiba/contracts";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { playerAliases, playerSnapshots, players } from "../db/schema.js";
import { normalizeAlias } from "../lib/normalization.js";
import { resolvePlayer } from "./player-identity.js";

export class PlayerCanonicalNameConflictError extends Error {
  constructor() {
    super("Canonical player name is already in use");
    this.name = "PlayerCanonicalNameConflictError";
  }
}

export class PlayerSnapshotNotFoundError extends Error {
  constructor() {
    super("Player snapshot not found");
    this.name = "PlayerSnapshotNotFoundError";
  }
}

export async function upsertPlayerSnapshot(
  data: PlayerImport,
): Promise<{ playerId: string; snapshotId: string }> {
  return db.transaction(async (tx) => {
    const player = await resolvePlayer(tx, data.canonicalName);

    for (const alias of new Set([data.canonicalName, ...data.aliases])) {
      await tx
        .insert(playerAliases)
        .values({
          playerId: player.id,
          alias,
          normalizedAlias: normalizeAlias(alias),
        })
        .onConflictDoNothing();
    }

    const [latestSnapshot] = await tx
      .select({ dataVersion: playerSnapshots.dataVersion })
      .from(playerSnapshots)
      .where(eq(playerSnapshots.playerId, player.id))
      .orderBy(desc(playerSnapshots.dataVersion))
      .limit(1);

    const [snapshot] = await tx
      .insert(playerSnapshots)
      .values({
        playerId: player.id,
        dataVersion: (latestSnapshot?.dataVersion ?? 0) + 1,
        countryCode: data.countryCode,
        countryGroupCode: data.countryGroup,
        region: data.region,
        primaryRole: data.primaryRole,
        currentOrLastTeam: data.currentOrLastTeam,
        rosterStatus: data.rosterStatus,
        isActiveRoster: data.isActiveRoster,
        isCoach: data.isCoach,
        isFeaturedTeam: data.isFeaturedTeam,
        isVctCnTeam: data.isVctCnTeam,
        championsTitles: data.championsTitles,
        mastersTitles: data.mastersTitles,
        leagueTitles: data.leagueTitles,
        dataAsOf: new Date(`${data.dataAsOf}T00:00:00.000Z`),
        sourceUrl: data.sourceUrl,
        sourceCheckedAt: new Date(data.sourceCheckedAt),
        reviewStatus: data.reviewStatus,
      })
      .returning({ id: playerSnapshots.id });

    return { playerId: player.id, snapshotId: snapshot.id };
  });
}

export async function updateLatestPlayerSnapshot(
  playerId: string,
  data: PlayerImport,
): Promise<{ playerId: string; snapshotId: string }> {
  return db.transaction(async (tx) => {
    const [player] = await tx
      .select({ id: players.id })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    if (!player) throw new PlayerSnapshotNotFoundError();

    const [nameConflict] = await tx
      .select({ id: players.id })
      .from(players)
      .where(
        and(
          ne(players.id, playerId),
          sql`lower(${players.canonicalName}) = lower(${data.canonicalName})`,
        ),
      )
      .limit(1);
    if (nameConflict) throw new PlayerCanonicalNameConflictError();

    const [latestSnapshot] = await tx
      .select({ id: playerSnapshots.id })
      .from(playerSnapshots)
      .where(eq(playerSnapshots.playerId, playerId))
      .orderBy(desc(playerSnapshots.dataVersion))
      .limit(1);
    if (!latestSnapshot) throw new PlayerSnapshotNotFoundError();

    for (const alias of new Set([data.canonicalName, ...data.aliases])) {
      await tx
        .insert(playerAliases)
        .values({
          playerId,
          alias,
          normalizedAlias: normalizeAlias(alias),
        })
        .onConflictDoNothing();
    }

    await tx
      .update(players)
      .set({ canonicalName: data.canonicalName, updatedAt: new Date() })
      .where(eq(players.id, playerId));

    const [snapshot] = await tx
      .update(playerSnapshots)
      .set({
        countryCode: data.countryCode,
        countryGroupCode: data.countryGroup,
        region: data.region,
        primaryRole: data.primaryRole,
        currentOrLastTeam: data.currentOrLastTeam,
        rosterStatus: data.rosterStatus,
        isActiveRoster: data.isActiveRoster,
        isCoach: data.isCoach,
        isFeaturedTeam: data.isFeaturedTeam,
        isVctCnTeam: data.isVctCnTeam,
        championsTitles: data.championsTitles,
        mastersTitles: data.mastersTitles,
        leagueTitles: data.leagueTitles,
        dataAsOf: new Date(`${data.dataAsOf}T00:00:00.000Z`),
        sourceUrl: data.sourceUrl,
        sourceCheckedAt: new Date(data.sourceCheckedAt),
        reviewStatus: data.reviewStatus,
      })
      .where(eq(playerSnapshots.id, latestSnapshot.id))
      .returning({ id: playerSnapshots.id });

    return { playerId, snapshotId: snapshot.id };
  });
}
