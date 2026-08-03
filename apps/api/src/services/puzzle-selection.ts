import { and, eq, or, sql } from "drizzle-orm";
import type { Difficulty } from "@valo-yiba/contracts";
import { db } from "../db/client.js";
import { playerSnapshots, players } from "../db/schema.js";

export function versusDifficulty(random = Math.random()): Difficulty {
  if (random < 0.3) return "beginner";
  if (random < 0.8) return "easy";
  return "full";
}

export function fallbackDifficulties(first: Difficulty): Difficulty[] {
  return Array.from(new Set<Difficulty>([first, "easy", "beginner", "full"]));
}

function eligibilityConditions(difficulty: Difficulty) {
  const base = [
    eq(players.status, "active"),
    eq(playerSnapshots.reviewStatus, "approved"),
    eq(playerSnapshots.isCoach, false),
  ];

  if (difficulty === "beginner") {
    return [
      ...base,
      eq(playerSnapshots.isActiveRoster, true),
      or(
        eq(playerSnapshots.isFeaturedTeam, true),
        eq(playerSnapshots.isVctCnTeam, true),
      ),
    ];
  }

  if (difficulty === "easy") {
    return [...base, eq(playerSnapshots.isActiveRoster, true)];
  }

  return base;
}

export async function findRandomEligibleSnapshot(difficulty: Difficulty) {
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

  const [target] = await db
    .select({ playerId: players.id, snapshotId: playerSnapshots.id })
    .from(players)
    .innerJoin(playerSnapshots, eq(playerSnapshots.playerId, players.id))
    .innerJoin(
      latestApprovedSnapshots,
      and(
        eq(latestApprovedSnapshots.playerId, playerSnapshots.playerId),
        eq(latestApprovedSnapshots.dataVersion, playerSnapshots.dataVersion),
      ),
    )
    .where(and(...eligibilityConditions(difficulty)))
    .orderBy(sql`random()`)
    .limit(1);
  return target;
}

export async function findVersusEligibleSnapshot(random = Math.random()) {
  const requestedDifficulty = versusDifficulty(random);
  for (const difficulty of fallbackDifficulties(requestedDifficulty)) {
    const target = await findRandomEligibleSnapshot(difficulty);
    if (target) return { ...target, difficulty, requestedDifficulty };
  }
  return undefined;
}
