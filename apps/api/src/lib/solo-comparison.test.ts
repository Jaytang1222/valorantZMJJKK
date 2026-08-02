import { describe, expect, it } from "vitest";
import { compareSoloGuess } from "./solo-comparison.js";

const target = {
  region: "pacific",
  countryCode: "KR",
  countryGroupCode: "east_asia",
  primaryRole: "duelist",
  currentOrLastTeam: "GEN",
  championsTitles: 1,
  mastersTitles: 2,
  heroTop3: ["Jett", "Raze", "Yoru"] as [string, string, string],
};

describe("compareSoloGuess", () => {
  it("returns exact, nearby, directional, and partial statuses", () => {
    expect(
      compareSoloGuess(
        {
          ...target,
          countryCode: "JP",
          championsTitles: 0,
          mastersTitles: 3,
          heroTop3: ["Jett", "Sova", "Omen"],
        },
        target,
      ),
    ).toMatchObject({
      region: "exact",
      country: "nearby",
      championsTitles: "higher",
      mastersTitles: "lower",
      heroTop3: "partial",
    });
  });
});
