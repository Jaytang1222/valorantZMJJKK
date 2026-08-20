import { describe, expect, it } from "vitest";
import { rankPlayer, searchPlayers } from "./player-search";

const players = [
  { canonicalName: "TenZ", aliases: ["tenz", "s0m"] },
  { canonicalName: "zekken", aliases: ["z"] },
  { canonicalName: "ZmjjKK", aliases: ["zmjjkk", "kk"] },
  { canonicalName: "Jinggg", aliases: ["jing", "jinggg"] },
  { canonicalName: "yay", aliases: ["yayster"] },
];

describe("rankPlayer", () => {
  it("exact name match ranks 0", () => {
    expect(rankPlayer(players[0], "tenz")).toBe(0);
    expect(rankPlayer(players[2], "ZmjjKK")).toBe(0);
  });

  it("name prefix ranks 1", () => {
    expect(rankPlayer(players[3], "jing")).toBe(1);
  });

  it("alias prefix ranks 2", () => {
    expect(rankPlayer(players[0], "s0m")).toBe(2);
  });

  it("substring ranks 3", () => {
    expect(rankPlayer(players[4], "ster")).toBe(3);
  });

  it("extra text match ranks 4", () => {
    expect(rankPlayer(players[0], "Sentinels", "SentinelS")).toBe(4);
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
  it("orders by rank and limits results", () => {
    const results = searchPlayers(players, "jing", 8);
    expect(results.map((p) => p.canonicalName)).toEqual(["Jinggg"]);
  });

  it("limits to top N", () => {
    const results = searchPlayers(players, "z", 2);
    expect(results.map((p) => p.canonicalName)).toEqual(["zekken", "ZmjjKK"]);
  });

  it("returns empty for blank query", () => {
    expect(searchPlayers(players, "  ", 8)).toEqual([]);
  });

  it("matches extra text with limit", () => {
    const results = searchPlayers(players, "sentinels", 8, (p) =>
      p.canonicalName === "TenZ" ? "Sentinels" : "",
    );
    expect(results.map((p) => p.canonicalName)).toEqual(["TenZ"]);
  });
});