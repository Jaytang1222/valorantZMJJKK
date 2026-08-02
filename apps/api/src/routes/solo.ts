import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  guesses,
  playerSnapshots,
  players,
  puzzles,
  soloAttempts,
} from "../db/schema.js";
import { verifySession } from "./auth.js";
import { compareSoloGuess } from "../lib/solo-comparison.js";
import { invalidateLeaderboard } from "../services/leaderboard.js";

const difficulty = z.enum(["beginner", "easy", "full"]);
const createSchema = z.object({
  difficulty,
  guestId: z.string().uuid().optional(),
});
const guessSchema = z.object({
  playerId: z.string().uuid(),
  guestId: z.string().uuid().optional(),
});

function bearer(header: string | undefined) {
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}
function ownsAttempt(
  attempt: typeof soloAttempts.$inferSelect,
  userId: string | null,
  guestId: string | undefined,
) {
  return userId ? attempt.userId === userId : attempt.guestId === guestId;
}

export async function registerSoloRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/solo/attempts", async (request, reply) => {
    const input = createSchema.parse(request.body);
    const userId = verifySession(bearer(request.headers.authorization));
    const guestId = userId ? null : (input.guestId ?? randomUUID());
    const rows = await db
      .select({ snapshotId: playerSnapshots.id })
      .from(playerSnapshots)
      .innerJoin(players, eq(players.id, playerSnapshots.playerId))
      .where(
        and(
          eq(players.status, "active"),
          eq(playerSnapshots.reviewStatus, "approved"),
        ),
      )
      .orderBy(sql`random()`)
      .limit(1);
    if (!rows[0])
      return reply.serviceUnavailable("No approved puzzle is available");
    let [puzzle] = await db
      .select()
      .from(puzzles)
      .where(
        and(
          eq(puzzles.snapshotId, rows[0].snapshotId),
          eq(puzzles.difficulty, input.difficulty),
          eq(puzzles.status, "approved"),
        ),
      )
      .limit(1);
    if (!puzzle)
      [puzzle] = await db
        .insert(puzzles)
        .values({
          snapshotId: rows[0].snapshotId,
          difficulty: input.difficulty,
          status: "approved",
        })
        .returning();
    const [attempt] = await db
      .insert(soloAttempts)
      .values({
        puzzleId: puzzle.id,
        difficulty: input.difficulty,
        userId,
        guestId,
      })
      .returning();
    return reply.status(201).send({
      attempt: {
        id: attempt.id,
        difficulty: attempt.difficulty,
        status: attempt.status,
        guessCount: 0,
        startedAt: attempt.startedAt,
      },
      guestId,
    });
  });

  app.post(
    "/v1/solo/attempts/:attemptId/guesses",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { attemptId } = z
        .object({ attemptId: z.string().uuid() })
        .parse(request.params);
      const input = guessSchema.parse(request.body);
      const userId = verifySession(bearer(request.headers.authorization));
      const [attempt] = await db
        .select()
        .from(soloAttempts)
        .where(eq(soloAttempts.id, attemptId))
        .limit(1);
      if (!attempt || !ownsAttempt(attempt, userId, input.guestId))
        return reply.notFound("Attempt not found");
      if (attempt.status !== "active")
        return reply.conflict("Attempt is already settled");
      const [target] = await db
        .select({
          snapshot: playerSnapshots,
          playerId: players.id,
          canonicalName: players.canonicalName,
        })
        .from(puzzles)
        .innerJoin(playerSnapshots, eq(playerSnapshots.id, puzzles.snapshotId))
        .innerJoin(players, eq(players.id, playerSnapshots.playerId))
        .where(eq(puzzles.id, attempt.puzzleId))
        .limit(1);
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
      const [guessed] = await db
        .select({
          snapshot: playerSnapshots,
          playerId: players.id,
          canonicalName: players.canonicalName,
        })
        .from(players)
        .innerJoin(playerSnapshots, eq(playerSnapshots.playerId, players.id))
        .innerJoin(
          latestApprovedSnapshots,
          and(
            eq(latestApprovedSnapshots.playerId, playerSnapshots.playerId),
            eq(
              latestApprovedSnapshots.dataVersion,
              playerSnapshots.dataVersion,
            ),
          ),
        )
        .where(
          and(
            eq(players.id, input.playerId),
            eq(playerSnapshots.reviewStatus, "approved"),
          ),
        )
        .limit(1);
      if (!target || !guessed)
        return reply.badRequest("Selected player is unavailable");
      const isCorrect = target.playerId === guessed.playerId;
      const nextCount = attempt.guessCount + 1;
      const status = isCorrect ? "won" : nextCount >= 8 ? "lost" : "active";
      const result = compareSoloGuess(guessed.snapshot, target.snapshot);
      const settled = await db.transaction(async (tx) => {
        const updated = await tx
          .update(soloAttempts)
          .set({
            guessCount: nextCount,
            status,
            score: status === "won" ? 900 - (nextCount - 1) * 100 : 0,
            finishedAt: status === "active" ? null : new Date(),
          })
          .where(
            and(
              eq(soloAttempts.id, attempt.id),
              eq(soloAttempts.status, "active"),
              eq(soloAttempts.guessCount, attempt.guessCount),
            ),
          )
          .returning({ id: soloAttempts.id });
        if (!updated[0]) return false;
        await tx.insert(guesses).values({
          soloAttemptId: attempt.id,
          userId,
          guessedPlayerId: guessed.playerId,
          isCorrect,
          comparison: result,
        });
        return true;
      });
      if (!settled)
        return reply.conflict("Attempt changed; refresh before guessing again");
      if (status !== "active" && userId) await invalidateLeaderboard("solo");
      return {
        guess: {
          playerId: guessed.playerId,
          canonicalName: guessed.canonicalName,
          isCorrect,
          comparison: result,
        },
        attempt: {
          id: attempt.id,
          status,
          guessCount: nextCount,
          score: status === "won" ? 900 - (nextCount - 1) * 100 : 0,
        },
        result:
          status === "active"
            ? undefined
            : {
                target: { canonicalName: target.canonicalName },
                score: status === "won" ? 900 - (nextCount - 1) * 100 : 0,
              },
      };
    },
  );

  app.get("/v1/solo/attempts/:attemptId", async (request, reply) => {
    const { attemptId } = z
      .object({ attemptId: z.string().uuid() })
      .parse(request.params);
    const guestId = z
      .object({ guestId: z.string().uuid().optional() })
      .parse(request.query).guestId;
    const userId = verifySession(bearer(request.headers.authorization));
    const [attempt] = await db
      .select()
      .from(soloAttempts)
      .where(eq(soloAttempts.id, attemptId))
      .limit(1);
    if (!attempt || !ownsAttempt(attempt, userId, guestId))
      return reply.notFound("Attempt not found");
    const history = await db
      .select({
        canonicalName: players.canonicalName,
        isCorrect: guesses.isCorrect,
        comparison: guesses.comparison,
        createdAt: guesses.createdAt,
      })
      .from(guesses)
      .innerJoin(players, eq(players.id, guesses.guessedPlayerId))
      .where(eq(guesses.soloAttemptId, attempt.id))
      .orderBy(asc(guesses.createdAt));
    const [target] =
      attempt.status === "active"
        ? []
        : await db
            .select({ canonicalName: players.canonicalName })
            .from(puzzles)
            .innerJoin(
              playerSnapshots,
              eq(playerSnapshots.id, puzzles.snapshotId),
            )
            .innerJoin(players, eq(players.id, playerSnapshots.playerId))
            .where(eq(puzzles.id, attempt.puzzleId))
            .limit(1);
    return {
      attempt: {
        id: attempt.id,
        difficulty: attempt.difficulty,
        status: attempt.status,
        guessCount: attempt.guessCount,
        score: attempt.score,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
      },
      guesses: history,
      result: target ? { target, score: attempt.score } : undefined,
    };
  });

  app.post("/v1/solo/attempts/:attemptId/abandon", async (request, reply) => {
    const { attemptId } = z
      .object({ attemptId: z.string().uuid() })
      .parse(request.params);
    const { guestId } = z
      .object({ guestId: z.string().uuid().optional() })
      .parse(request.body);
    const userId = verifySession(bearer(request.headers.authorization));
    const [attempt] = await db
      .select()
      .from(soloAttempts)
      .where(eq(soloAttempts.id, attemptId))
      .limit(1);
    if (!attempt || !ownsAttempt(attempt, userId, guestId))
      return reply.notFound("Attempt not found");
    if (attempt.status !== "active")
      return reply.conflict("Attempt is already settled");
    await db
      .update(soloAttempts)
      .set({ status: "abandoned", score: 0, finishedAt: new Date() })
      .where(
        and(eq(soloAttempts.id, attempt.id), eq(soloAttempts.status, "active")),
      );
    const [target] = await db
      .select({ canonicalName: players.canonicalName })
      .from(puzzles)
      .innerJoin(playerSnapshots, eq(playerSnapshots.id, puzzles.snapshotId))
      .innerJoin(players, eq(players.id, playerSnapshots.playerId))
      .where(eq(puzzles.id, attempt.puzzleId))
      .limit(1);
    return {
      attempt: {
        id: attempt.id,
        status: "abandoned",
        guessCount: attempt.guessCount,
        score: 0,
      },
      result: { target, score: 0 },
    };
  });
}
