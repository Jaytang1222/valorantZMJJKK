import { describe, expect, it } from "vitest";
import { GUESS_FIELDS, matchSymbol, toneLabel } from "./guess-fields";

describe("public guess field presentation", () => {
  it("keeps age as the third field", () => {
    expect(GUESS_FIELDS.map(([field]) => field)).toEqual([
      "region",
      "country",
      "age",
      "status",
      "primaryRole",
      "currentOrLastTeam",
      "championsTitles",
      "mastersTitles",
      "leagueTitles",
    ]);
  });

  it("normalizes comparison tones for a shared legend", () => {
    expect(toneLabel("equal")).toBe("exact");
    expect(toneLabel("partial")).toBe("nearby");
    expect(toneLabel("higher")).toBe("direction");
    expect(toneLabel("mismatch")).toBe("mismatch");
    expect(matchSymbol("higher")).toBe("↑");
    expect(matchSymbol("lower")).toBe("↓");
    expect(matchSymbol("exact")).toBe("");
  });
});
