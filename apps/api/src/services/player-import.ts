import type { PlayerImport } from "@valo-yiba/contracts";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { playerAliases, players, playerSnapshots } from "../db/schema.js";
import { normalizeAlias } from "../lib/normalization.js";

export async function upsertPlayerSnapshot(
  data: PlayerImport,
): Promise<{ playerId: string; snapshotId: string }> {
  return db.transaction(async (tx) => {
    const [player] = await tx
      .insert(players)
      .values({ canonicalName: data.canonicalName })
      .onConflictDoUpdate({
        target: players.canonicalName,
        set: { status: "active", updatedAt: new Date() },
      })
      .returning({ id: players.id });

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
        championsTitles: data.championsTitles,
        mastersTitles: data.mastersTitles,
        heroTop3: data.heroTop3,
        dataAsOf: new Date(`${data.dataAsOf}T00:00:00.000Z`),
        sourceUrl: data.sourceUrl,
        sourceCheckedAt: new Date(data.sourceCheckedAt),
        reviewStatus: data.reviewStatus,
      })
      .returning({ id: playerSnapshots.id });

    return { playerId: player.id, snapshotId: snapshot.id };
  });
}
