import { z } from "zod";

export const difficultySchema = z.enum(["beginner", "easy", "full"]);
export type Difficulty = z.infer<typeof difficultySchema>;

export const gameModeSchema = z.enum(["solo", "versus"]);
export type GameMode = z.infer<typeof gameModeSchema>;

export const countryMatchSchema = z.enum(["exact", "nearby", "mismatch"]);
export const valueMatchSchema = z.enum(["exact", "partial", "mismatch"]);
export const numericMatchSchema = z.enum(["higher", "lower", "equal"]);

export const playerImportSchema = z.object({
  canonicalName: z.string().trim().min(1).max(64),
  aliases: z.array(z.string().trim().min(1).max(64)).max(20),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  countryGroup: z.string().trim().min(1).max(64),
  region: z.enum(["americas", "emea", "pacific", "china"]),
  primaryRole: z.enum([
    "duelist",
    "initiator",
    "controller",
    "sentinel",
    "flex",
    "coach",
  ]),
  currentOrLastTeam: z.string().trim().min(1).max(128),
  isActiveRoster: z.boolean().default(true),
  isCoach: z.boolean().default(false),
  isFeaturedTeam: z.boolean().default(false),
  isVctCnTeam: z.boolean().default(false),
  championsTitles: z.number().int().min(0).max(10),
  mastersTitles: z.number().int().min(0).max(20),
  heroTop3: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  dataAsOf: z.string().date(),
  sourceUrl: z.string().url(),
  sourceCheckedAt: z.string().datetime(),
  reviewStatus: z.enum(["pending_review", "approved", "rejected"]),
});

export type PlayerImport = z.infer<typeof playerImportSchema>;

export const createSoloAttemptSchema = z.object({
  difficulty: difficultySchema,
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
  services: z.object({ database: z.literal("ok"), redis: z.literal("ok") }),
});
