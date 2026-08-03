import { describe, expect, it } from "vitest";
import { fallbackDifficulties, versusDifficulty } from "./puzzle-selection.js";

describe("versus difficulty selection", () => {
  it("uses the configured 30/50/20 distribution boundaries", () => {
    expect(versusDifficulty(0)).toBe("beginner");
    expect(versusDifficulty(0.299999)).toBe("beginner");
    expect(versusDifficulty(0.3)).toBe("easy");
    expect(versusDifficulty(0.799999)).toBe("easy");
    expect(versusDifficulty(0.8)).toBe("full");
  });

  it("tries the requested pool before deterministic fallbacks", () => {
    expect(fallbackDifficulties("beginner")).toEqual([
      "beginner",
      "easy",
      "full",
    ]);
    expect(fallbackDifficulties("easy")).toEqual(["easy", "beginner", "full"]);
    expect(fallbackDifficulties("full")).toEqual(["full", "easy", "beginner"]);
  });
});
