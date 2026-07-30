import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { playerImportSchema } from "@valo-yiba/contracts";
import { eq } from "drizzle-orm";
import { db, closeDatabase } from "../db/client.js";
import { playerAliases, players, playerSnapshots } from "../db/schema.js";
import { normalizeAlias } from "../lib/normalization.js";

type CsvRow = Record<string, string>;

function parseRow(row: CsvRow) {
  return playerImportSchema.parse({
    canonicalName: row.canonical_name,
    aliases: row.aliases.split("|").filter(Boolean),
    countryCode: row.country_code,
    countryGroup: row.country_group,
    region: row.region,
    primaryRole: row.primary_role,
    currentOrLastTeam: row.current_or_last_team,
    championsTitles: Number(row.champions_titles),
    mastersTitles: Number(row.masters_titles),
    heroTop3: row.hero_top_3.split("|") as [string, string, string],
    dataAsOf: row.data_as_of,
    sourceUrl: row.source_url,
    sourceCheckedAt: row.source_checked_at,
    reviewStatus: row.review_status,
  });
}

const path = process.argv[2] ?? "../../data/players.seed.csv";
const csv = await readFile(path, "utf8");
const rows = parse(csv, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
}) as CsvRow[];

try {
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

  console.info(`Seeded ${rows.length} player drafts.`);
} finally {
  await closeDatabase();
}
