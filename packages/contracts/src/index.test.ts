import { describe, expect, it } from "vitest";
import { createSoloAttemptSchema, playerImportSchema } from "./index.js";

describe("createSoloAttemptSchema", () => {
  it("accepts the optional regional placeholder fields", () => {
    const result = createSoloAttemptSchema.safeParse({
      difficulty: "beginner",
      region: "china",
      activeOnly: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported regional values", () => {
    const result = createSoloAttemptSchema.safeParse({
      difficulty: "beginner",
      region: "pacific-cn",
    });

    expect(result.success).toBe(false);
  });
});

describe("playerImportSchema", () => {
  it("accepts a complete reviewed player snapshot", () => {
    const result = playerImportSchema.safeParse({
      canonicalName: "Example",
      aliases: ["example"],
      countryCode: "CA",
      countryGroup: "north_america",
      region: "americas",
      primaryRole: "duelist",
      roles: ["duelist", "flex"],
      currentOrLastTeam: "Example Team",
      isActiveRoster: true,
      championsTitles: 0,
      mastersTitles: 1,
      leagueTitles: 2,
      dataAsOf: "2026-07-29",
      sourceUrl: "https://example.com/player/example",
      sourceCheckedAt: "2026-07-29T00:00:00.000Z",
      reviewStatus: "pending_review",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.age).toBe(20);
  });

  it("rejects ages outside the supported player range", () => {
    const result = playerImportSchema.safeParse({
      canonicalName: "Example",
      aliases: ["example"],
      countryCode: "CA",
      countryGroup: "north_america",
      age: 12,
      region: "americas",
      primaryRole: "duelist",
      currentOrLastTeam: "Example Team",
      isActiveRoster: true,
      championsTitles: 0,
      mastersTitles: 1,
      leagueTitles: 2,
      dataAsOf: "2026-07-29",
      sourceUrl: "https://example.com/player/example",
      sourceCheckedAt: "2026-07-29T00:00:00.000Z",
      reviewStatus: "pending_review",
    });

    expect(result.success).toBe(false);
  });

  it("requires a boolean status value", () => {
    const result = playerImportSchema.safeParse({
      canonicalName: "Example",
      aliases: ["example"],
      countryCode: "CA",
      countryGroup: "north_america",
      region: "americas",
      primaryRole: "duelist",
      currentOrLastTeam: "Example Team",
      isActiveRoster: "active",
      championsTitles: 0,
      mastersTitles: 1,
      leagueTitles: 2,
      dataAsOf: "2026-07-29",
      sourceUrl: "https://example.com/player/example",
      sourceCheckedAt: "2026-07-29T00:00:00.000Z",
      reviewStatus: "pending_review",
    });

    expect(result.success).toBe(false);
  });
});
