import { describe, expect, it } from "vitest";
import { normalizeAlias } from "./normalization.js";

describe("normalizeAlias", () => {
  it("normalizes whitespace, Unicode width and case", () => {
    expect(normalizeAlias("  ＴｅＮＺ   ")).toBe("tenz");
  });
});
