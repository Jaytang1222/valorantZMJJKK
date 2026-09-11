import { describe, expect, it } from "vitest";
import { compareSoloGuess } from "./solo-comparison.js";

const target = {
  region: "pacific",
  countryCode: "KR",
  countryGroupCode: "east_asia",
  age: 20,
  primaryRole: "duelist",
  playerRoles: ["duelist", "flex"],
  currentOrLastTeam: "GEN",
  isActiveRoster: true,
  championsTitles: 1,
  mastersTitles: 2,
  leagueTitles: 3,
};

describe("compareSoloGuess", () => {
  it("returns exact, nearby, directional, and partial statuses", () => {
    expect(
      compareSoloGuess(
        {
          ...target,
          countryCode: "JP",
          age: 19,
          championsTitles: 0,
          mastersTitles: 3,
          leagueTitles: 5,
          isActiveRoster: false,
        },
        target,
      ),
    ).toMatchObject({
      region: "exact",
      country: "nearby",
      age: "higher",
      championsTitles: "higher",
      mastersTitles: "lower",
      leagueTitles: "lower",
      status: "mismatch",
    });
  });

  it("compares age using equal, higher, and lower directions", () => {
    expect(compareSoloGuess({ ...target, age: 20 }, target).age).toBe("equal");
    expect(compareSoloGuess({ ...target, age: 19 }, target).age).toBe("higher");
    expect(compareSoloGuess({ ...target, age: 21 }, target).age).toBe("lower");
  });

  it("matches when multi-role sets overlap", () => {
    expect(
      compareSoloGuess(
        { ...target, primaryRole: "sentinel", playerRoles: ["sentinel"] },
        target,
      ).primaryRole,
    ).toBe("mismatch");
    expect(
      compareSoloGuess(
        {
          ...target,
          primaryRole: "controller",
          playerRoles: ["controller", "duelist"],
        },
        target,
      ).primaryRole,
    ).toBe("exact");
  });
});
