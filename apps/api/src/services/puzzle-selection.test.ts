import { describe, expect, it } from "vitest";
import { fallbackDifficulties, versusDifficulty } from "./puzzle-selection.js";

describe("versus difficulty selection", () => {
  it("uses the configured 60/30/10 distribution boundaries", () => {
    expect(versusDifficulty(0)).toBe("beginner");
    expect(versusDifficulty(0.599999)).toBe("beginner");
    expect(versusDifficulty(0.6)).toBe("easy");
    expect(versusDifficulty(0.899999)).toBe("easy");
    expect(versusDifficulty(0.9)).toBe("full");
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
