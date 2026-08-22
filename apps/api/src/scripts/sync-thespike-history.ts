import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { vctTeams, type VctTeam } from "./vct-teams.js";

type CsvRow = Record<string, string>;
type ThespikePlayer = {
  id: number;
  nickname: string;
  name?: string;
  surname?: string;
  countryCode?: string;
  dateJoined?: string | null;
  dateLeft?: string | null;
};
type ThespikeTeam = {
  id: number;
  title: string;
  slug: string;
  pastPlayers?: ThespikePlayer[];
};
type NextData = { props?: { pageProps?: { team?: ThespikeTeam } } };

const outputPath = process.argv[2] ?? "../../data/players.seed.csv";
const reportPath =
  process.env.THESPIKE_HISTORY_REPORT ??
  "../../data/vct-history-thespike-added.2026-08-22.csv";
const asOf = process.env.THESPIKE_HISTORY_AS_OF ?? "2026-08-22";
const checkedAt = `${asOf}T12:00:00.000Z`;
const requestDelayMs = Math.max(
  250,
  Number(process.env.THESPIKE_REQUEST_DELAY_MS ?? "750"),
);
const requestTimeoutMs = Math.max(
  5000,
  Number(process.env.THESPIKE_REQUEST_TIMEOUT_MS ?? "20000"),
);
const maxAttempts = Math.max(
  1,
  Number(process.env.THESPIKE_MAX_ATTEMPTS ?? "3"),
);
const requestedTeams = new Set(
  (process.env.THESPIKE_HISTORY_TEAMS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
const userAgent =
  process.env.THESPIKE_USER_AGENT ?? "KangYiBa roster audit/1.0";

const headers = [
  "canonical_name",
  "aliases",
  "country_code",
  "country_group",
  "region",
  "primary_role",
  "current_or_last_team",
  "roster_status",
  "is_active_roster",
  "is_coach",
  "is_featured_team",
  "is_vct_cn_team",
  "champions_titles",
  "masters_titles",
  "champions_appearances",
  "data_as_of",
  "source_url",
  "source_checked_at",
  "review_status",
];

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function csvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function groupForCountry(code: string): string {
  const groups: Record<string, string> = {
    CA: "north_america",
    US: "north_america",
    BR: "south_america",
    AR: "south_america",
    CL: "south_america",
    CO: "south_america",
    PE: "south_america",
    MX: "north_america",
    DE: "western_europe",
    DK: "northern_europe",
    EE: "northern_europe",
    ES: "southern_europe",
    FI: "northern_europe",
    FR: "western_europe",
    GB: "western_europe",
    IE: "western_europe",
    LT: "northern_europe",
    MD: "eastern_europe",
    NL: "western_europe",
    NO: "northern_europe",
    PL: "eastern_europe",
    PT: "southern_europe",
    RO: "eastern_europe",
    RU: "eastern_europe",
    SE: "northern_europe",
    TR: "middle_east",
    EG: "middle_east",
    IL: "middle_east",
    KZ: "eastern_europe",
    LB: "middle_east",
    KH: "southeast_asia",
    ID: "southeast_asia",
    IN: "south_asia",
    JP: "east_asia",
    KR: "east_asia",
    MY: "southeast_asia",
    PH: "southeast_asia",
    SG: "southeast_asia",
    TH: "southeast_asia",
    VN: "southeast_asia",
    CN: "east_asia",
    HK: "east_asia",
    TW: "east_asia",
    AU: "oceania",
    NZ: "oceania",
    CH: "western_europe",
    RS: "eastern_europe",
    UA: "eastern_europe",
    UN: "eastern_europe",
  };
  return groups[code] ?? "east_asia";
}

function normalizeCountryCode(value: string | undefined): string {
  const code = (value ?? "UN").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "UN";
}

function teamSlugCandidates(team: VctTeam): string[] {
  const aliases: Record<string, string[]> = {
    "KRÜ Esports": ["kru-esports", "kru"],
    "2GAME Esports": ["2game"],
    "Rex Regum Qeon": ["rrq"],
    "DetonatioN FocusMe": ["detonationfm", "dfm"],
    "Xi Lai Gaming": ["xlg"],
    "EDward Gaming": ["edg"],
    "Bilibili Gaming": ["blg"],
    "FunPlus Phoenix": ["fp"],
    "Dragon Ranger Gaming": ["drg"],
    "Nongshim RedForce": ["nongshim"],
    "Team Vitality": ["vitality"],
    "Team Liquid": ["liquid"],
    "Team Secret": ["secret"],
    "FULL SENSE": ["full-sense"],
    "ZETA DIVISION": ["zeta"],
    "Sharper Esports": ["sharper-esport"],
  };
  return [team.slug, ...(aliases[team.name] ?? [])].map(normalize);
}

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      const response = await fetch(url, {
        headers: { "user-agent": userAgent },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      if (response.ok) {
        const text = await response.text();
        await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
        return text;
      }
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`${response.status} ${url}`);
      }
      const waitMs = requestDelayMs * 2 ** (attempt - 1);
      console.warn(
        `[thespike-history] HTTP ${response.status}; retrying in ${waitMs}ms: ${url}`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const waitMs = requestDelayMs * 2 ** (attempt - 1);
      console.warn(
        `[thespike-history] ${String(error)}; retrying in ${waitMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw new Error(`request attempts exhausted: ${url}`);
}

function extractTeamUrls(sitemap: string): string[] {
  return [
    ...sitemap.matchAll(
      /<loc>(https:\/\/www\.thespike\.gg\/team\/[^<]+)<\/loc>/g,
    ),
  ].map((match) => match[1]);
}

function extractNextData(html: string): ThespikeTeam | null {
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const bodyStart = start + marker.length;
  const bodyEnd = html.indexOf("</script>", bodyStart);
  if (bodyEnd < 0) return null;
  try {
    const data = JSON.parse(html.slice(bodyStart, bodyEnd)) as NextData;
    return data.props?.pageProps?.team ?? null;
  } catch {
    return null;
  }
}

function knownPlayer(rows: CsvRow[], player: ThespikePlayer): boolean {
  const fullName = `${player.name ?? ""} ${player.surname ?? ""}`.trim();
  const wanted = new Set(
    [normalize(player.nickname), normalize(fullName)].filter(Boolean),
  );
  return rows.some((row) =>
    [row.canonical_name, ...(row.aliases ?? "").split("|")].some((value) =>
      wanted.has(normalize(value)),
    ),
  );
}

function toRow(
  player: ThespikePlayer,
  team: VctTeam,
  sourceUrl: string,
): CsvRow {
  const countryCode = normalizeCountryCode(player.countryCode);
  const fullName = `${player.name ?? ""} ${player.surname ?? ""}`.trim();
  return {
    canonical_name: player.nickname,
    aliases:
      fullName && normalize(fullName) !== normalize(player.nickname)
        ? fullName
        : "",
    country_code: countryCode,
    country_group: groupForCountry(countryCode),
    region: team.region,
    primary_role: "flex",
    current_or_last_team: team.name,
    roster_status: "transferred",
    is_active_roster: "false",
    is_coach: "false",
    is_featured_team: "false",
    is_vct_cn_team: String(team.region === "china"),
    champions_titles: "0",
    masters_titles: "0",
    champions_appearances: "0",
    data_as_of: asOf,
    source_url: sourceUrl,
    source_checked_at: checkedAt,
    review_status: "approved",
  };
}

const input = await readFile(outputPath, "utf8");
const rows = parse(input, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
}) as CsvRow[];
for (const row of rows) {
  const countryCode = normalizeCountryCode(row.country_code);
  if (countryCode !== row.country_code) {
    row.country_code = countryCode;
    row.country_group = groupForCountry(countryCode);
  }
}
const knownRows = [...rows];

const sitemapUrls = await Promise.all(
  Array.from({ length: 5 }, (_, index) =>
    fetchText(`https://www.thespike.gg/sitemap/en/teams/${index + 1}.xml`),
  ),
);
const teamUrls = sitemapUrls.flatMap(extractTeamUrls);
const normalizedUrlBySlug = new Map<string, string>();
for (const url of teamUrls) {
  const match = url.match(/\/team\/([^/]+\/\d+)/);
  if (!match) continue;
  const slug = match[1].split("/")[0];
  normalizedUrlBySlug.set(normalize(slug), url);
}

const selectedTeams =
  requestedTeams.size === 0
    ? vctTeams
    : vctTeams.filter(
        (team) =>
          requestedTeams.has(team.slug.toLowerCase()) ||
          requestedTeams.has(team.name.toLowerCase()) ||
          requestedTeams.has(String(team.id)),
      );
const additions: Array<{
  player: ThespikePlayer;
  team: VctTeam;
  sourceUrl: string;
}> = [];
const failures: string[] = [];

for (const [index, team] of selectedTeams.entries()) {
  const sourceUrl = teamSlugCandidates(team)
    .map((slug) => normalizedUrlBySlug.get(slug))
    .find(Boolean);
  if (!sourceUrl) {
    failures.push(`${team.name}: no THESPIKE team page in sitemap`);
    console.warn(
      `[thespike-history] ${index + 1}/${selectedTeams.length} ${team.name}: no page`,
    );
    continue;
  }
  try {
    const data = extractNextData(await fetchText(sourceUrl));
    const former = data?.pastPlayers ?? [];
    let fresh = 0;
    for (const player of former) {
      if (
        !player.nickname ||
        knownPlayer(
          [
            ...knownRows,
            ...additions.map(({ player: item }) =>
              toRow(item, team, sourceUrl),
            ),
          ],
          player,
        )
      )
        continue;
      additions.push({ player, team, sourceUrl });
      fresh += 1;
    }
    console.info(
      `[thespike-history] completed ${index + 1}/${selectedTeams.length} ${team.name}: ${former.length} past players, ${fresh} new; total ${additions.length}`,
    );
  } catch (error) {
    failures.push(`${team.name}: ${String(error)}`);
    console.warn(
      `[thespike-history] failed ${index + 1}/${selectedTeams.length} ${team.name}: ${String(error)}`,
    );
  }
}

for (const { player, team, sourceUrl } of additions)
  rows.push(toRow(player, team, sourceUrl));
const output =
  [headers.map(csvValue).join(",")]
    .concat(
      rows.map((row) =>
        headers.map((header) => csvValue(row[header] ?? "")).join(","),
      ),
    )
    .join("\n") + "\n";
await writeFile(outputPath, output, "utf8");

const reportHeaders = [
  "player_id",
  "player_name",
  "team",
  "region",
  "country_code",
  "date_joined",
  "date_left",
  "source_url",
];
const reportHeader = reportHeaders.map(csvValue).join(",");
const serializeReportRow = (row: CsvRow): string =>
  reportHeaders
    .map((header) =>
      csvValue(
        header === "country_code"
          ? normalizeCountryCode(row[header])
          : (row[header] ?? ""),
      ),
    )
    .join(",");
const reportRows = additions.map(({ player, team, sourceUrl }) =>
  serializeReportRow({
    player_id: String(player.id),
    player_name: player.nickname,
    team: team.name,
    region: team.region,
    country_code: normalizeCountryCode(player.countryCode),
    date_joined: player.dateJoined ?? "",
    date_left: player.dateLeft ?? "",
    source_url: sourceUrl,
  }),
);
const previousReport = await readFile(reportPath, "utf8").catch(() => "");
const previousRows = previousReport
  ? (
      parse(previousReport, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as CsvRow[]
    ).map(serializeReportRow)
  : [];
const mergedReportRows = [...new Set([...previousRows, ...reportRows])];
await writeFile(
  reportPath,
  `${[reportHeader, ...mergedReportRows].join("\n")}\n`,
  "utf8",
);

console.info(
  `THESPIKE historical sync complete: ${additions.length} new players; ${rows.length} total rows; ${failures.length} team failures.`,
);
if (failures.length > 0) {
  console.warn("Failures:");
  for (const failure of failures) console.warn(`- ${failure}`);
}
