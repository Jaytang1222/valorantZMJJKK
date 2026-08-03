import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  notInArray,
  sql,
} from "drizzle-orm";
import { db } from "../db/client.js";
import {
  guesses,
  leaderboardEntries,
  moderationActions,
  roomParticipants,
  roomRounds,
  rooms,
  playerSnapshots,
  players,
  puzzles,
  soloAttempts,
  users,
} from "../db/schema.js";
import { redis } from "../redis.js";

export type LeaderboardMode = "solo" | "versus";

type LeaderboardRow = {
  userId: string;
  displayName: string;
  totalScore: number;
  gamesPlayed: number;
  wins: number;
  totalGuesses: number;
  updatedAt: Date;
};

const cacheKey = (mode: LeaderboardMode) => `valo:leaderboard:${mode}`;
const CACHE_TTL_SECONDS = 60;

function asNumber(value: number | string) {
  return typeof value === "number" ? value : Number(value);
}

async function rebuildLeaderboard(mode: LeaderboardMode) {
  const excludedRows = await db
    .select({ userId: moderationActions.targetUserId })
    .from(moderationActions)
    .where(
      and(
        eq(moderationActions.active, true),
        inArray(moderationActions.action, ["hide_leaderboard", "void_scores"]),
      ),
    );
  const excludedUserIds = excludedRows.map((row) => row.userId);
  await db.transaction(async (tx) => {
    await tx
      .delete(leaderboardEntries)
      .where(eq(leaderboardEntries.mode, mode));

    if (mode === "solo") {
      const rows = await tx
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
            isNotNull(soloAttempts.userId),
            inArray(soloAttempts.status, ["won", "lost"]),
            ...(excludedUserIds.length > 0
              ? [notInArray(soloAttempts.userId, excludedUserIds)]
              : []),
          ),
        )
        .groupBy(soloAttempts.userId);
      if (rows.length > 0) {
        await tx.insert(leaderboardEntries).values(
          rows.map((row) => ({
            mode,
            userId: row.userId!,
            totalScore: asNumber(row.totalScore),
            gamesPlayed: asNumber(row.gamesPlayed),
            wins: asNumber(row.wins),
            totalGuesses: asNumber(row.totalGuesses),
          })),
        );
      }
      return;
    }

    const rows = await tx
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
        and(eq(roomRounds.roomId, rooms.id), eq(roomRounds.roundNumber, 1)),
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
          eq(rooms.rankedEligible, true),
          ...(excludedUserIds.length > 0
            ? [notInArray(roomParticipants.userId, excludedUserIds)]
            : []),
        ),
      )
      .groupBy(roomParticipants.userId);
    if (rows.length > 0) {
      await tx.insert(leaderboardEntries).values(
        rows.map((row) => ({
          mode,
          userId: row.userId,
          totalScore: asNumber(row.totalScore),
          gamesPlayed: asNumber(row.gamesPlayed),
          wins: asNumber(row.wins),
          totalGuesses: asNumber(row.totalGuesses),
        })),
      );
    }
  });
}

async function loadRows(mode: LeaderboardMode): Promise<LeaderboardRow[]> {
  const cached = await redis.get(cacheKey(mode));
  if (cached) return JSON.parse(cached) as LeaderboardRow[];

  await rebuildLeaderboard(mode);
  const rows = await db
    .select({
      userId: leaderboardEntries.userId,
      displayName: users.displayName,
      totalScore: leaderboardEntries.totalScore,
      gamesPlayed: leaderboardEntries.gamesPlayed,
      wins: leaderboardEntries.wins,
      totalGuesses: leaderboardEntries.totalGuesses,
      updatedAt: leaderboardEntries.updatedAt,
    })
    .from(leaderboardEntries)
    .innerJoin(users, eq(users.id, leaderboardEntries.userId))
    .where(eq(leaderboardEntries.mode, mode))
    .orderBy(
      desc(leaderboardEntries.totalScore),
      desc(leaderboardEntries.wins),
      asc(leaderboardEntries.gamesPlayed),
      asc(users.normalizedDisplayName),
    );
  await redis.set(
    cacheKey(mode),
    JSON.stringify(rows),
    "EX",
    CACHE_TTL_SECONDS,
  );
  return rows;
}

function rankRows(rows: LeaderboardRow[]) {
  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    averageGuesses:
      row.gamesPlayed === 0
        ? 0
        : Number((row.totalGuesses / row.gamesPlayed).toFixed(2)),
    winRate:
      row.gamesPlayed === 0
        ? 0
        : Number((row.wins / row.gamesPlayed).toFixed(4)),
  }));
}

function summaryFromRow(
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
  const gamesPlayed = asNumber(row.gamesPlayed);
  if (gamesPlayed === 0) return null;
  const wins = asNumber(row.wins);
  const totalGuesses = asNumber(row.totalGuesses);
  return {
    totalScore: asNumber(row.totalScore),
    gamesPlayed,
    wins,
    averageGuesses:
      gamesPlayed === 0 ? 0 : Number((totalGuesses / gamesPlayed).toFixed(2)),
    winRate: gamesPlayed === 0 ? 0 : Number((wins / gamesPlayed).toFixed(4)),
  };
}

async function getSoloStats(userId: string) {
  const [row] = await db
    .select({
      totalScore: sql<number>`coalesce(sum(${soloAttempts.score}), 0)::int`,
      gamesPlayed: sql<number>`count(*)::int`,
      wins: sql<number>`count(*) filter (where ${soloAttempts.status} = 'won')::int`,
      totalGuesses: sql<number>`coalesce(sum(${soloAttempts.guessCount}), 0)::int`,
    })
    .from(soloAttempts)
    .where(
      and(
        eq(soloAttempts.userId, userId),
        inArray(soloAttempts.status, ["won", "lost"]),
      ),
    );
  return summaryFromRow(row);
}

async function getVersusStats(userId: string) {
  const [row] = await db
    .select({
      totalScore: sql<number>`count(distinct ${rooms.id}) filter (where ${rooms.winnerUserId} = ${roomParticipants.userId})::int`,
      gamesPlayed: sql<number>`count(distinct ${rooms.id})::int`,
      wins: sql<number>`count(distinct ${rooms.id}) filter (where ${rooms.winnerUserId} = ${roomParticipants.userId})::int`,
      totalGuesses: sql<number>`count(${guesses.id})::int`,
    })
    .from(roomParticipants)
    .innerJoin(rooms, eq(rooms.id, roomParticipants.roomId))
    .leftJoin(
      roomRounds,
      and(eq(roomRounds.roomId, rooms.id), eq(roomRounds.roundNumber, 1)),
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
        eq(roomParticipants.userId, userId),
        isNotNull(rooms.finishedAt),
        isNotNull(rooms.winnerUserId),
      ),
    )
    .groupBy(roomParticipants.userId);
  return summaryFromRow(row);
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return 0;
  const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function encodeCursor(offset: number) {
  return Buffer.from(String(offset)).toString("base64url");
}

export async function getLeaderboard(input: {
  mode: LeaderboardMode;
  cursor?: string;
  limit: number;
  userId?: string | null;
}) {
  const rows = rankRows(await loadRows(input.mode));
  const offset = decodeCursor(input.cursor);
  const entries = rows.slice(offset, offset + input.limit);
  const nextOffset = offset + entries.length;
  const currentIndex = input.userId
    ? rows.findIndex((row) => row.userId === input.userId)
    : -1;

  return {
    entries,
    nextCursor: nextOffset < rows.length ? encodeCursor(nextOffset) : null,
    currentUser:
      currentIndex === -1
        ? null
        : {
            entry: rows[currentIndex],
            neighbors: rows.slice(
              Math.max(0, currentIndex - 5),
              currentIndex + 6,
            ),
          },
    updatedAt: rows[0]?.updatedAt ?? null,
  };
}

export async function invalidateLeaderboard(mode: LeaderboardMode) {
  await redis.del(cacheKey(mode));
}

export async function getAccountSummary(userId: string) {
  const [solo, versus, soloRecent, versusRecent] = await Promise.all([
    getSoloStats(userId),
    getVersusStats(userId),
    db
      .select({
        id: soloAttempts.id,
        mode: sql<"solo">`'solo'`,
        result: soloAttempts.status,
        guessCount: soloAttempts.guessCount,
        score: soloAttempts.score,
        finishedAt: soloAttempts.finishedAt,
        targetName: players.canonicalName,
      })
      .from(soloAttempts)
      .innerJoin(puzzles, eq(puzzles.id, soloAttempts.puzzleId))
      .innerJoin(playerSnapshots, eq(playerSnapshots.id, puzzles.snapshotId))
      .innerJoin(players, eq(players.id, playerSnapshots.playerId))
      .where(
        and(
          eq(soloAttempts.userId, userId),
          inArray(soloAttempts.status, ["won", "lost", "abandoned"]),
          isNotNull(soloAttempts.finishedAt),
        ),
      )
      .orderBy(desc(soloAttempts.finishedAt))
      .limit(3),
    db
      .select({
        id: rooms.id,
        mode: sql<"versus">`'versus'`,
        result: sql<
          "won" | "lost"
        >`case when ${rooms.winnerUserId} = ${roomParticipants.userId} then 'won' else 'lost' end`,
        guessCount: sql<number>`count(${guesses.id})::int`,
        score: sql<number>`case when ${rooms.winnerUserId} = ${roomParticipants.userId} then 1 else 0 end`,
        finishedAt: rooms.finishedAt,
        targetName: players.canonicalName,
      })
      .from(roomParticipants)
      .innerJoin(rooms, eq(rooms.id, roomParticipants.roomId))
      .innerJoin(
        roomRounds,
        and(eq(roomRounds.roomId, rooms.id), eq(roomRounds.roundNumber, 1)),
      )
      .innerJoin(puzzles, eq(puzzles.id, roomRounds.puzzleId))
      .innerJoin(playerSnapshots, eq(playerSnapshots.id, puzzles.snapshotId))
      .innerJoin(players, eq(players.id, playerSnapshots.playerId))
      .leftJoin(
        guesses,
        and(
          eq(guesses.roomRoundId, roomRounds.id),
          eq(guesses.userId, roomParticipants.userId),
        ),
      )
      .where(
        and(
          eq(roomParticipants.userId, userId),
          isNotNull(rooms.finishedAt),
          isNotNull(rooms.winnerUserId),
        ),
      )
      .groupBy(
        rooms.id,
        roomParticipants.userId,
        rooms.winnerUserId,
        rooms.finishedAt,
        players.canonicalName,
      )
      .orderBy(desc(rooms.finishedAt))
      .limit(3),
  ]);
  const recentGames = [...soloRecent, ...versusRecent]
    .sort(
      (left, right) =>
        (right.finishedAt?.getTime() ?? 0) - (left.finishedAt?.getTime() ?? 0),
    )
    .slice(0, 3);
  return {
    solo,
    versus,
    recentGames,
  };
}

export async function getPublicVersusProfile(userId: string) {
  const [user] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const stats = await getVersusStats(userId);
  return {
    displayName: user.displayName,
    gamesPlayed: stats?.gamesPlayed ?? 0,
    wins: stats?.wins ?? 0,
    winRate: stats?.winRate ?? 0,
    averageGuesses: stats?.averageGuesses ?? 0,
  };
}
