import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  guesses,
  playerAliases,
  playerSnapshots,
  players,
} from "../db/schema.js";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function resolvePlayer(tx: DbTransaction, canonicalName: string) {
  const matches = await tx
    .select({ id: players.id, canonicalName: players.canonicalName })
    .from(players)
    .where(sql`lower(${players.canonicalName}) = lower(${canonicalName})`)
    .orderBy(asc(players.createdAt));

  let player = matches.find(
    (candidate) => candidate.canonicalName === canonicalName,
  );
  if (!player) {
    if (matches.length > 0) {
      player = matches[0];
      await tx
        .update(players)
        .set({ canonicalName, status: "active", updatedAt: new Date() })
        .where(eq(players.id, player.id));
    } else {
      [player] = await tx
        .insert(players)
        .values({ canonicalName })
        .returning({ id: players.id, canonicalName: players.canonicalName });
    }
  } else {
    await tx
      .update(players)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(players.id, player.id));
  }

  const duplicatePlayers = matches.filter(
    (candidate) => candidate.id !== player.id,
  );
  for (const duplicate of duplicatePlayers) {
    const duplicateAliases = await tx
      .select({
        alias: playerAliases.alias,
        normalizedAlias: playerAliases.normalizedAlias,
      })
      .from(playerAliases)
      .where(eq(playerAliases.playerId, duplicate.id));

    for (const alias of duplicateAliases) {
      await tx
        .insert(playerAliases)
        .values({
          playerId: player.id,
          alias: alias.alias,
          normalizedAlias: alias.normalizedAlias,
        })
        .onConflictDoNothing();
    }

    await tx
      .update(guesses)
      .set({ guessedPlayerId: player.id })
      .where(eq(guesses.guessedPlayerId, duplicate.id));

    const duplicateSnapshots = await tx
      .select({ id: playerSnapshots.id })
      .from(playerSnapshots)
      .where(eq(playerSnapshots.playerId, duplicate.id))
      .orderBy(asc(playerSnapshots.dataVersion));
    const [latestTargetSnapshot] = await tx
      .select({ dataVersion: playerSnapshots.dataVersion })
      .from(playerSnapshots)
      .where(eq(playerSnapshots.playerId, player.id))
      .orderBy(desc(playerSnapshots.dataVersion))
      .limit(1);
    let nextVersion = latestTargetSnapshot?.dataVersion ?? 0;

    for (const snapshot of duplicateSnapshots) {
      nextVersion += 1;
      await tx
        .update(playerSnapshots)
        .set({ playerId: player.id, dataVersion: nextVersion })
        .where(eq(playerSnapshots.id, snapshot.id));
    }

    await tx
      .delete(playerAliases)
      .where(eq(playerAliases.playerId, duplicate.id));
    await tx.delete(players).where(eq(players.id, duplicate.id));
  }

  return player;
}
