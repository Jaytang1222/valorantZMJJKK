import { describe, expect, it } from "vitest";
import { playerImportSchema } from "./index.js";

describe("playerImportSchema", () => {
  it("accepts a complete reviewed player snapshot", () => {
    const result = playerImportSchema.safeParse({
      canonicalName: "Example",
      aliases: ["example"],
      countryCode: "CA",
      countryGroup: "north_america",
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

    expect(result.success).toBe(true);
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
