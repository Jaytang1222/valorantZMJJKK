import { z } from "zod";

export const difficultySchema = z.enum(["beginner", "easy", "full"]);
export type Difficulty = z.infer<typeof difficultySchema>;

export const soloRegionSchema = z.enum([
  "china",
  "americas",
  "emea",
  "pacific",
]);
export type SoloRegion = z.infer<typeof soloRegionSchema>;
export const REGIONAL_POOL_NOT_AVAILABLE =
  "REGIONAL_POOL_NOT_AVAILABLE" as const;

export const gameModeSchema = z.enum(["solo", "versus"]);
export type GameMode = z.infer<typeof gameModeSchema>;

export const countryMatchSchema = z.enum(["exact", "nearby", "mismatch"]);
export const valueMatchSchema = z.enum(["exact", "partial", "mismatch"]);
export const numericMatchSchema = z.enum(["higher", "lower", "equal"]);
export const playerRoleSchema = z.enum([
  "duelist",
  "initiator",
  "controller",
  "sentinel",
  "flex",
  "coach",
]);
export type PlayerRole = z.infer<typeof playerRoleSchema>;

export const playerImportSchema = z.object({
  canonicalName: z.string().trim().min(1).max(64),
  aliases: z.array(z.string().trim().min(1).max(64)).max(20),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  countryGroup: z.string().trim().min(1).max(64),
  age: z.number().int().min(13).max(60).default(20),
  region: z.enum(["americas", "emea", "pacific", "china"]),
  primaryRole: playerRoleSchema,
  roles: z.array(playerRoleSchema).min(1).max(6).optional(),
  currentOrLastTeam: z.string().trim().min(1).max(128),
  rosterStatus: z
    .enum(["active", "benched", "transferred", "retired", "inactive"])
    .default("active"),
  isActiveRoster: z.boolean().default(true),
  isCoach: z.boolean().default(false),
  isFeaturedTeam: z.boolean().default(false),
  isVctCnTeam: z.boolean().default(false),
  championsTitles: z.number().int().min(0).max(10),
  mastersTitles: z.number().int().min(0).max(20),
  leagueTitles: z.number().int().min(0).max(20),
  dataAsOf: z.string().date(),
  sourceUrl: z.string().url(),
  sourceCheckedAt: z.string().datetime(),
  reviewStatus: z.enum(["pending_review", "approved", "rejected"]),
});

export type PlayerImport = z.infer<typeof playerImportSchema>;

export const createSoloAttemptSchema = z.object({
  difficulty: difficultySchema,
  region: soloRegionSchema.optional(),
  activeOnly: z.boolean().optional(),
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
  services: z.object({ database: z.literal("ok"), redis: z.literal("ok") }),
});
