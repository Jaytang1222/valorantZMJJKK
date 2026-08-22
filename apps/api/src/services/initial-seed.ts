import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { playerImportSchema } from "@valo-yiba/contracts";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  countryGroups,
  playerAliases,
  playerSnapshots,
} from "../db/schema.js";
import { normalizeAlias } from "../lib/normalization.js";
import { resolvePlayer } from "./player-identity.js";

type CsvRow = Record<string, string>;

const initialCountryGroups = [
  ["east_asia", "East Asia"],
  ["southeast_asia", "Southeast Asia"],
  ["south_asia", "South Asia"],
  ["middle_east", "Middle East"],
  ["north_america", "North America"],
  ["south_america", "South America"],
  ["western_europe", "Western Europe"],
  ["northern_europe", "Northern Europe"],
  ["southern_europe", "Southern Europe"],
  ["eastern_europe", "Eastern Europe"],
  ["oceania", "Oceania"],
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
    rosterStatus:
      row.roster_status ??
      (row.is_active_roster === "false" ? "retired" : "active"),
    isActiveRoster:
      row.is_active_roster === undefined
        ? true
        : row.is_active_roster === "true",
    isCoach: row.is_coach === "true",
    isFeaturedTeam: row.is_featured_team === "true",
    isVctCnTeam: row.is_vct_cn_team === "true",
    championsTitles: Number(row.champions_titles),
    mastersTitles: Number(row.masters_titles),
    championsAppearances: Number(row.champions_appearances),
    dataAsOf: row.data_as_of,
    sourceUrl: row.source_url,
    sourceCheckedAt: row.source_checked_at,
    reviewStatus: row.review_status,
  });
}

function snapshotMatchesData(
  snapshot: typeof playerSnapshots.$inferSelect | undefined,
  data: ReturnType<typeof parseRow>,
) {
  return (
    snapshot?.countryCode === data.countryCode &&
    snapshot.countryGroupCode === data.countryGroup &&
    snapshot.region === data.region &&
    snapshot.primaryRole === data.primaryRole &&
    snapshot.currentOrLastTeam === data.currentOrLastTeam &&
    snapshot.rosterStatus === data.rosterStatus &&
    snapshot.isActiveRoster === data.isActiveRoster &&
    snapshot.isCoach === data.isCoach &&
    snapshot.isFeaturedTeam === data.isFeaturedTeam &&
    snapshot.isVctCnTeam === data.isVctCnTeam &&
    snapshot.championsTitles === data.championsTitles &&
    snapshot.mastersTitles === data.mastersTitles &&
    snapshot.championsAppearances === data.championsAppearances &&
    snapshot.dataAsOf.getTime() ===
      new Date(`${data.dataAsOf}T00:00:00.000Z`).getTime() &&
    snapshot.sourceUrl === data.sourceUrl &&
    snapshot.sourceCheckedAt.getTime() === new Date(data.sourceCheckedAt).getTime() &&
    snapshot.reviewStatus === data.reviewStatus
  );
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
      .values({ code, displayName, version: 2 })
      .onConflictDoNothing();
  }

  for (const row of rows) {
    const data = parseRow(row);
    await db.transaction(async (tx) => {
      const player = await resolvePlayer(tx, data.canonicalName);

      for (const alias of new Set([data.canonicalName, ...data.aliases])) {
        await tx
          .insert(playerAliases)
          .values({
            playerId: player.id,
            alias,
            normalizedAlias: normalizeAlias(alias),
          })
          .onConflictDoNothing();
      }

      const [latestSnapshot] = await tx
        .select()
        .from(playerSnapshots)
        .where(eq(playerSnapshots.playerId, player.id))
        .orderBy(desc(playerSnapshots.dataVersion))
        .limit(1);
      const snapshotValues = {
        playerId: player.id,
        dataVersion: latestSnapshot?.dataVersion ?? 0,
        countryCode: data.countryCode,
        countryGroupCode: data.countryGroup,
        region: data.region,
        primaryRole: data.primaryRole,
        currentOrLastTeam: data.currentOrLastTeam,
        rosterStatus: data.rosterStatus,
        isActiveRoster: data.isActiveRoster,
        isCoach: data.isCoach,
        isFeaturedTeam: data.isFeaturedTeam,
        isVctCnTeam: data.isVctCnTeam,
        championsTitles: data.championsTitles,
        mastersTitles: data.mastersTitles,
        championsAppearances: data.championsAppearances,
        dataAsOf: new Date(`${data.dataAsOf}T00:00:00.000Z`),
        sourceUrl: data.sourceUrl,
        sourceCheckedAt: new Date(data.sourceCheckedAt),
        reviewStatus: data.reviewStatus,
      };

      if (snapshotMatchesData(latestSnapshot, data)) {
        await tx
          .update(playerSnapshots)
          .set(snapshotValues)
          .where(eq(playerSnapshots.id, latestSnapshot.id));
      } else {
        await tx.insert(playerSnapshots).values({
          ...snapshotValues,
          dataVersion: snapshotValues.dataVersion + 1,
        });
      }
    });
  }

  return rows.length;
}
