import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "user",
  "editor",
  "moderator",
  "admin",
]);
export const reviewStatusEnum = pgEnum("review_status", [
  "pending_review",
  "approved",
  "rejected",
]);
export const playerStatusEnum = pgEnum("player_status", ["active", "disabled"]);
export const regionEnum = pgEnum("region", [
  "americas",
  "emea",
  "pacific",
  "china",
]);
export const playerRoleEnum = pgEnum("player_role", [
  "duelist",
  "initiator",
  "controller",
  "sentinel",
  "flex",
]);
export const difficultyEnum = pgEnum("difficulty", [
  "beginner",
  "easy",
  "full",
]);
export const attemptStatusEnum = pgEnum("attempt_status", [
  "active",
  "won",
  "lost",
  "abandoned",
]);
export const roomStateEnum = pgEnum("room_state", [
  "lobby",
  "countdown",
  "playing",
  "round_result",
  "finished",
  "cancelled",
]);
export const participantStateEnum = pgEnum("participant_state", [
  "connected",
  "disconnected",
  "forfeited",
  "left",
]);
export const leaderboardModeEnum = pgEnum("leaderboard_mode", [
  "solo",
  "versus",
]);
export const reportStatusEnum = pgEnum("report_status", [
  "open",
  "resolved",
  "dismissed",
]);
export const moderationActionEnum = pgEnum("moderation_action", [
  "hide_leaderboard",
  "void_scores",
  "restrict_account",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    displayName: varchar("display_name", { length: 20 }).notNull(),
    normalizedDisplayName: varchar("normalized_display_name", {
      length: 20,
    }).notNull(),
    email: varchar("email", { length: 320 }),
    normalizedEmail: varchar("normalized_email", { length: 320 }),
    passwordHash: text("password_hash"),
    role: userRoleEnum("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_display_name_unique").on(table.normalizedDisplayName),
    uniqueIndex("users_normalized_email_unique").on(table.normalizedEmail),
  ],
);

export const countryGroups = pgTable(
  "country_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 64 }).notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("country_groups_code_version_unique").on(
      table.code,
      table.version,
    ),
  ],
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalName: varchar("canonical_name", { length: 64 }).notNull(),
    status: playerStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("players_canonical_name_unique").on(table.canonicalName),
  ],
);

export const playerAliases = pgTable(
  "player_aliases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    alias: varchar("alias", { length: 64 }).notNull(),
    normalizedAlias: varchar("normalized_alias", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("player_aliases_normalized_alias_unique").on(
      table.normalizedAlias,
    ),
    index("player_aliases_player_id_idx").on(table.playerId),
  ],
);

export const playerSnapshots = pgTable(
  "player_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    dataVersion: integer("data_version").notNull(),
    countryCode: varchar("country_code", { length: 2 }).notNull(),
    countryGroupCode: varchar("country_group_code", { length: 64 }).notNull(),
    region: regionEnum("region").notNull(),
    primaryRole: playerRoleEnum("primary_role").notNull(),
    currentOrLastTeam: varchar("current_or_last_team", {
      length: 128,
    }).notNull(),
    championsTitles: integer("champions_titles").notNull().default(0),
    mastersTitles: integer("masters_titles").notNull().default(0),
    heroTop3: jsonb("hero_top_3").$type<[string, string, string]>().notNull(),
    dataAsOf: timestamp("data_as_of", { withTimezone: true }).notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceCheckedAt: timestamp("source_checked_at", {
      withTimezone: true,
    }).notNull(),
    reviewStatus: reviewStatusEnum("review_status")
      .notNull()
      .default("pending_review"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("player_snapshots_player_version_unique").on(
      table.playerId,
      table.dataVersion,
    ),
    index("player_snapshots_review_status_idx").on(table.reviewStatus),
  ],
);

export const puzzles = pgTable(
  "puzzles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => playerSnapshots.id, { onDelete: "restrict" }),
    difficulty: difficultyEnum("difficulty").notNull(),
    status: reviewStatusEnum("status").notNull().default("pending_review"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("puzzles_difficulty_status_idx").on(table.difficulty, table.status),
  ],
);

export const soloAttempts = pgTable(
  "solo_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    guestId: uuid("guest_id"),
    puzzleId: uuid("puzzle_id")
      .notNull()
      .references(() => puzzles.id, { onDelete: "restrict" }),
    difficulty: difficultyEnum("difficulty").notNull(),
    status: attemptStatusEnum("status").notNull().default("active"),
    guessCount: integer("guess_count").notNull().default(0),
    score: integer("score"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("solo_attempts_user_started_idx").on(table.userId, table.startedAt),
    index("solo_attempts_puzzle_idx").on(table.puzzleId),
  ],
);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 6 }),
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    state: roomStateEnum("state").notNull().default("lobby"),
    isPublic: boolean("is_public").notNull().default(false),
    isMatchmade: boolean("is_matchmade").notNull().default(false),
    rankedEligible: boolean("ranked_eligible").notNull().default(false),
    roundCount: integer("round_count").notNull().default(1),
    roundDurationSeconds: integer("round_duration_seconds")
      .notNull()
      .default(60),
    currentRound: integer("current_round").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    winnerUserId: uuid("winner_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    finishReason: varchar("finish_reason", { length: 32 }),
  },
  (table) => [
    uniqueIndex("rooms_code_unique").on(table.code),
    index("rooms_state_public_idx").on(table.state, table.isPublic),
    index("rooms_ranked_eligible_idx").on(
      table.rankedEligible,
      table.finishedAt,
    ),
  ],
);

export const roomParticipants = pgTable(
  "room_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    state: participantStateEnum("state").notNull().default("connected"),
    score: integer("score").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    forfeitedAt: timestamp("forfeited_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("room_participants_room_user_unique").on(
      table.roomId,
      table.userId,
    ),
    index("room_participants_room_state_idx").on(table.roomId, table.state),
  ],
);

export const roomRounds = pgTable(
  "room_rounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    puzzleId: uuid("puzzle_id")
      .notNull()
      .references(() => puzzles.id, { onDelete: "restrict" }),
    roundNumber: integer("round_number").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    winnerUserId: uuid("winner_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    finishReason: varchar("finish_reason", { length: 32 }),
  },
  (table) => [
    uniqueIndex("room_rounds_room_number_unique").on(
      table.roomId,
      table.roundNumber,
    ),
  ],
);

export const guesses = pgTable(
  "guesses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    soloAttemptId: uuid("solo_attempt_id").references(() => soloAttempts.id, {
      onDelete: "cascade",
    }),
    roomRoundId: uuid("room_round_id").references(() => roomRounds.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    guessedPlayerId: uuid("guessed_player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    isCorrect: boolean("is_correct").notNull(),
    comparison: jsonb("comparison").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("guesses_solo_attempt_idx").on(table.soloAttemptId),
    index("guesses_room_round_idx").on(table.roomRoundId),
  ],
);

export const leaderboardEntries = pgTable(
  "leaderboard_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mode: leaderboardModeEnum("mode").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    totalScore: integer("total_score").notNull().default(0),
    gamesPlayed: integer("games_played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    totalGuesses: integer("total_guesses").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("leaderboard_entries_mode_user_unique").on(
      table.mode,
      table.userId,
    ),
    index("leaderboard_entries_mode_score_idx").on(
      table.mode,
      table.totalScore,
    ),
  ],
);

export const contentReports = pgTable(
  "content_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    category: varchar("category", { length: 32 }).notNull(),
    subject: varchar("subject", { length: 128 }).notNull(),
    details: text("details").notNull(),
    status: reportStatusEnum("status").notNull().default("open"),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolution: text("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("content_reports_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: moderationActionEnum("action").notNull(),
    reason: text("reason").notNull(),
    active: boolean("active").notNull().default(true),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("moderation_actions_target_active_idx").on(
      table.targetUserId,
      table.active,
    ),
  ],
);

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 64 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 128 }).notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("admin_audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const playersRelations = relations(players, ({ many }) => ({
  aliases: many(playerAliases),
  snapshots: many(playerSnapshots),
}));
export const playerAliasesRelations = relations(playerAliases, ({ one }) => ({
  player: one(players, {
    fields: [playerAliases.playerId],
    references: [players.id],
  }),
}));
export const playerSnapshotsRelations = relations(
  playerSnapshots,
  ({ one, many }) => ({
    player: one(players, {
      fields: [playerSnapshots.playerId],
      references: [players.id],
    }),
    puzzles: many(puzzles),
  }),
);
