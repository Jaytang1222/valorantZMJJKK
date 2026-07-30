import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { playerImportSchema } from "@valo-yiba/contracts";

const path = process.argv[2] ?? "../../data/players.seed.csv";
const input = await readFile(path, "utf8");
const rows = parse(input, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
}) as Record<string, string>[];
const errors: string[] = [];

for (const [index, row] of rows.entries()) {
  const parsed = playerImportSchema.safeParse({
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
  if (!parsed.success)
    errors.push(
      `row ${index + 2}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.info(`Validated ${rows.length} player rows.`);
}
