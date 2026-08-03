import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { playerImportSchema } from "@valo-yiba/contracts";
import { db } from "../db/client.js";
import {
  countryGroups,
  playerAliases,
  players,
  playerSnapshots,
} from "../db/schema.js";
import { normalizeAlias } from "../lib/normalization.js";

type CsvRow = Record<string, string>;

const initialCountryGroups = [
  ["north_america", "North America"],
  ["south_america", "South America"],
  ["western_europe", "Western Europe"],
  ["eastern_europe", "Eastern Europe"],
  ["east_asia", "East Asia"],
  ["southeast_asia", "Southeast Asia"],
  ["greater_china", "Greater China"],
  ["oceania", "Oceania"],
  ["middle_east", "Middle East"],
  ["north_africa", "North Africa"],
] as const;

function parseRow(row: CsvRow) {
  return playerImportSchema.parse({
    canonicalName: row.canonical_name,
    aliases: row.aliases.split("|").filter(Boolean),
    countryCode: row.country_code,
    countryGroup: row.country_group,
    region: row.region,
    primaryRole: row.primary_role,
    currentOrLastTeam: row.current_or_last_team,
    isActiveRoster:
      row.is_active_roster === undefined
        ? true
        : row.is_active_roster === "true",
    isCoach: row.is_coach === "true",
    isFeaturedTeam: row.is_featured_team === "true",
    isVctCnTeam: row.is_vct_cn_team === "true",
    championsTitles: Number(row.champions_titles),
    mastersTitles: Number(row.masters_titles),
    heroTop3: row.hero_top_3.split("|") as [string, string, string],
    dataAsOf: row.data_as_of,
    sourceUrl: row.source_url,
    sourceCheckedAt: row.source_checked_at,
    reviewStatus: row.review_status,
  });
}

export async function seedInitialPlayerData(
  path = "../../data/players.seed.csv",
): Promise<number> {
  const csv = await readFile(path, "utf8");
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];

  for (const [code, displayName] of initialCountryGroups) {
    await db
      .insert(countryGroups)
      .values({ code, displayName, version: 1 })
      .onConflictDoNothing();
  }

  for (const row of rows) {
    const data = parseRow(row);
    const [player] = await db
      .insert(players)
      .values({ canonicalName: data.canonicalName })
      .onConflictDoUpdate({
        target: players.canonicalName,
        set: { status: "active", updatedAt: new Date() },
      })
      .returning({ id: players.id });

    for (const alias of new Set([data.canonicalName, ...data.aliases])) {
      await db
        .insert(playerAliases)
        .values({
          playerId: player.id,
          alias,
          normalizedAlias: normalizeAlias(alias),
        })
        .onConflictDoNothing();
    }

    await db
      .insert(playerSnapshots)
      .values({
        playerId: player.id,
        dataVersion: 1,
        countryCode: data.countryCode,
        countryGroupCode: data.countryGroup,
        region: data.region,
        primaryRole: data.primaryRole,
        currentOrLastTeam: data.currentOrLastTeam,
        isActiveRoster: data.isActiveRoster,
        isCoach: data.isCoach,
        isFeaturedTeam: data.isFeaturedTeam,
        isVctCnTeam: data.isVctCnTeam,
        championsTitles: data.championsTitles,
        mastersTitles: data.mastersTitles,
        heroTop3: data.heroTop3,
        dataAsOf: new Date(`${data.dataAsOf}T00:00:00.000Z`),
        sourceUrl: data.sourceUrl,
        sourceCheckedAt: new Date(data.sourceCheckedAt),
        reviewStatus: data.reviewStatus,
      })
      .onConflictDoUpdate({
        target: [playerSnapshots.playerId, playerSnapshots.dataVersion],
        set: {
          countryCode: data.countryCode,
          countryGroupCode: data.countryGroup,
          region: data.region,
          primaryRole: data.primaryRole,
          currentOrLastTeam: data.currentOrLastTeam,
          isActiveRoster: data.isActiveRoster,
          isCoach: data.isCoach,
          isFeaturedTeam: data.isFeaturedTeam,
          isVctCnTeam: data.isVctCnTeam,
          championsTitles: data.championsTitles,
          mastersTitles: data.mastersTitles,
          heroTop3: data.heroTop3,
          dataAsOf: new Date(`${data.dataAsOf}T00:00:00.000Z`),
          sourceUrl: data.sourceUrl,
          sourceCheckedAt: new Date(data.sourceCheckedAt),
          reviewStatus: data.reviewStatus,
        },
      });
  }

  return rows.length;
}
