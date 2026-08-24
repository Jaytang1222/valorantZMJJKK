import { describe, expect, it } from "vitest";
import { rankPlayer, searchPlayers } from "./player-search";

const players = [
  { canonicalName: "TenZ", aliases: ["tenz", "s0m"] },
  { canonicalName: "zekken", aliases: ["z"] },
  { canonicalName: "ZmjjKK", aliases: ["zmjjkk", "kk"] },
  { canonicalName: "Jinggg", aliases: ["jing", "jinggg"] },
  { canonicalName: "yay", aliases: ["yayster"] },
  { canonicalName: "f0rsakeN", aliases: ["forsaken", "Jason Susanto"] },
  { canonicalName: "valyn", aliases: ["valyn", "Jacob Batio"] },
  { canonicalName: "Lime", aliases: ["lime", "Jacob Foster"] },
];

describe("rankPlayer", () => {
  it("exact name match ranks 0", () => {
    expect(rankPlayer(players[0], "tenz")).toBe(0);
    expect(rankPlayer(players[2], "ZmjjKK")).toBe(0);
  });

  it("name prefix ranks 1", () => {
    expect(rankPlayer(players[3], "jing")).toBe(1);
  });

  it("extra field prefix ranks 2", () => {
    expect(rankPlayer(players[0], "Sentinels", ["Sentinels"])).toBe(2);
  });

  it("aliases and real names are ignored", () => {
    expect(rankPlayer(players[0], "s0m")).toBe(Infinity);
    expect(rankPlayer(players[5], "jason")).toBe(Infinity);
    expect(rankPlayer(players[6], "jacob")).toBe(Infinity);
  });

  it("non-prefix substring does not match", () => {
    expect(rankPlayer(players[4], "ster")).toBe(Infinity);
    expect(rankPlayer(players[2], "jkk")).toBe(Infinity);
  });

  it("no match ranks Infinity", () => {
    expect(rankPlayer(players[0], "xyz")).toBe(Infinity);
    expect(rankPlayer(players[0], "")).toBe(Infinity);
  });

  it("is case-insensitive", () => {
    expect(rankPlayer(players[2], "zmjjkk")).toBe(0);
    expect(rankPlayer(players[1], "ZEK")).toBe(1);
  });
});

describe("searchPlayers", () => {
  it("matches ID prefix only, ignoring aliases and real names", () => {
    const results = searchPlayers(players, "ja", 250);
    expect(results).toEqual([]);
  });

  it("orders exact before prefix", () => {
    const results = searchPlayers(players, "tenz", 8);
    expect(results.map((p) => p.canonicalName)).toEqual(["TenZ"]);
  });

  it("limits to top N", () => {
    const results = searchPlayers(players, "z", 2);
    expect(results.map((p) => p.canonicalName)).toEqual(["zekken", "ZmjjKK"]);
  });

  it("returns empty for blank query", () => {
    expect(searchPlayers(players, "  ", 8)).toEqual([]);
  });

  it("matches extra fields by prefix", () => {
    const results = searchPlayers(players, "sentinels", 8, (p) =>
      p.canonicalName === "TenZ" ? ["Sentinels"] : [],
    );
    expect(results.map((p) => p.canonicalName)).toEqual(["TenZ"]);
  });
});
