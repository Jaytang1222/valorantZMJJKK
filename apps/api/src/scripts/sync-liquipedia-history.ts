import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { vctTeams, type VctTeam } from "./vct-teams.js";

type CsvRow = Record<string, string>;
type FormerPlayer = {
  name: string;
  realName: string;
  countryCode: string;
  team: VctTeam;
  sourceUrl: string;
  joinDate: string;
  leaveDate: string;
};

const outputPath = process.argv[2] ?? "../../data/players.seed.csv";
const reportPath =
  process.env.LIQUIPEDIA_HISTORY_REPORT ??
  "../../data/vct-history-liquipedia.2026-08-22.csv";
const asOf = process.env.LIQUIPEDIA_HISTORY_AS_OF ?? "2026-08-22";
const checkedAt = `${asOf}T12:00:00.000Z`;
const requestDelayMs = Math.max(
  1000,
  Number(process.env.LIQUIPEDIA_REQUEST_DELAY_MS ?? "3500"),
);
const maxAttempts = Math.max(
  1,
  Number(process.env.LIQUIPEDIA_MAX_ATTEMPTS ?? "4"),
);
const requestedTeams = new Set(
  (process.env.LIQUIPEDIA_HISTORY_TEAMS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
const userAgent =
  process.env.LIQUIPEDIA_USER_AGENT ??
  "KangYiBa roster audit/1.0 (contact: jaytang12221@outlook.com)";

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
  "league_titles",
  "data_as_of",
  "source_url",
  "source_checked_at",
  "review_status",
];

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, number: string) =>
      String.fromCodePoint(Number(number)),
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ndash;/g, "-")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

const countryCodes: Record<string, string> = {
  Argentina: "AR",
  Australia: "AU",
  Austria: "AT",
  Brazil: "BR",
  Canada: "CA",
  Chile: "CL",
  China: "CN",
  Colombia: "CO",
  Croatia: "HR",
  Czechia: "CZ",
  Denmark: "DK",
  Egypt: "EG",
  Estonia: "EE",
  Finland: "FI",
  France: "FR",
  Germany: "DE",
  Greece: "GR",
  Hong_Kong: "HK",
  India: "IN",
  Indonesia: "ID",
  Ireland: "IE",
  Israel: "IL",
  Italy: "IT",
  Japan: "JP",
  Kazakhstan: "KZ",
  Latvia: "LV",
  Lebanon: "LB",
  Lithuania: "LT",
  Malaysia: "MY",
  Mexico: "MX",
  Netherlands: "NL",
  New_Zealand: "NZ",
  Norway: "NO",
  Pakistan: "PK",
  Peru: "PE",
  Philippines: "PH",
  Poland: "PL",
  Portugal: "PT",
  Romania: "RO",
  Russia: "RU",
  Saudi_Arabia: "SA",
  Serbia: "RS",
  Singapore: "SG",
  Slovakia: "SK",
  South_Korea: "KR",
  Spain: "ES",
  Sweden: "SE",
  Switzerland: "CH",
  Taiwan: "TW",
  Thailand: "TH",
  Turkey: "TR",
  Ukraine: "UA",
  United_Kingdom: "GB",
  United_States: "US",
  Vietnam: "VN",
};

function countryCodeFromRow(row: string): string {
  const match = row.match(/<img[^>]+alt="([^"]+)"/i);
  const raw = match?.[1]?.replace(/\s+/g, "_") ?? "";
  return countryCodes[raw] ?? "UN";
}

async function fetchTeamHtml(team: VctTeam): Promise<string> {
  const page = encodeURIComponent(
    team.name === "FNATIC" ? "Fnatic" : team.name,
  );
  const url =
    `https://liquipedia.net/valorant/api.php?action=parse&page=${page}` +
    "&prop=text&format=json";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": userAgent },
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          parse?: { text?: { "*"?: string } };
          error?: { code?: string; info?: string };
        };
        const html = payload.parse?.text?.["*"];
        if (!html) {
          throw new Error(
            payload.error?.info ?? `missing Liquipedia page: ${team.name}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
        return html;
      }
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`${response.status} ${team.name}`);
      }
      const waitMs = Math.max(
        requestDelayMs,
        retryAfter > 0
          ? retryAfter * 1000
          : requestDelayMs * 2 ** (attempt - 1),
      );
      console.warn(
        `[liquipedia-history] ${team.name}: HTTP ${response.status}; retrying in ${waitMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const waitMs = requestDelayMs * 2 ** (attempt - 1);
      console.warn(
        `[liquipedia-history] ${team.name}: ${String(error)}; retrying in ${waitMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw new Error(`request attempts exhausted: ${team.name}`);
}

function extractFormerPlayers(html: string, team: VctTeam): FormerPlayer[] {
  const title = html.match(
    /<div class="table2__title">Former Players<\/div>([\s\S]*?)(?:<div class="table2__title">|$)/i,
  )?.[1];
  if (!title) return [];
  const players: FormerPlayer[] = [];
  const rowPattern = /<tr class="table2__row--body">([\s\S]*?)<\/tr>/gi;
  for (const match of title.matchAll(rowPattern)) {
    const row = match[1];
    const playerLink = row.match(
      /href="\/valorant\/([^"?#]+)"[^>]*title="([^"]+)"/i,
    );
    if (!playerLink) continue;
    const name = decodeHtml(playerLink[2]);
    if (!name || name.startsWith("Category:") || name.startsWith("File:"))
      continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
      decodeHtml(cell[1]),
    );
    const dateCells = cells.filter((cell) => /^\d{4}-\d{2}-\d{2}$/.test(cell));
    players.push({
      name,
      realName: cells[1] ?? "",
      countryCode: countryCodeFromRow(row),
      team,
      sourceUrl: `https://liquipedia.net/valorant/${encodeURIComponent(team.name === "FNATIC" ? "Fnatic" : team.name)}`,
      joinDate: dateCells[0] ?? "",
      leaveDate: dateCells[1] ?? "",
    });
  }
  return [
    ...new Map(
      players.map((player) => [normalize(player.name), player]),
    ).values(),
  ];
}

function knownPlayer(rows: CsvRow[], name: string, realName: string): boolean {
  const wanted = new Set(
    [normalize(name), normalize(realName)].filter(Boolean),
  );
  return rows.some((row) =>
    [row.canonical_name, ...(row.aliases ?? "").split("|")].some((value) =>
      wanted.has(normalize(value)),
    ),
  );
}

function toRow(player: FormerPlayer): CsvRow {
  return {
    canonical_name: player.name,
    aliases:
      player.realName && player.realName !== player.name ? player.realName : "",
    country_code: player.countryCode,
    country_group: groupForCountry(player.countryCode),
    region: player.team.region,
    primary_role: "flex",
    current_or_last_team: player.team.name,
    roster_status: "transferred",
    is_active_roster: "false",
    is_coach: "false",
    is_featured_team: "false",
    is_vct_cn_team: String(player.team.region === "china"),
    champions_titles: "0",
    masters_titles: "0",
    league_titles: "0",
    data_as_of: asOf,
    source_url: player.sourceUrl,
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
const knownRows = [...rows];
const selectedTeams =
  requestedTeams.size === 0
    ? vctTeams
    : vctTeams.filter(
        (team) =>
          requestedTeams.has(team.slug.toLowerCase()) ||
          requestedTeams.has(team.name.toLowerCase()) ||
          requestedTeams.has(String(team.id)),
      );
const additions: FormerPlayer[] = [];

for (const [index, team] of selectedTeams.entries()) {
  try {
    const former = extractFormerPlayers(await fetchTeamHtml(team), team);
    const fresh = former.filter(
      (player) =>
        !knownPlayer(
          [...knownRows, ...additions.map(toRow)],
          player.name,
          player.realName,
        ),
    );
    for (const player of fresh) additions.push(player);
    console.info(
      `[liquipedia-history] completed ${index + 1}/${selectedTeams.length} ${team.name}: ${former.length} former players, ${fresh.length} new; total ${additions.length}`,
    );
  } catch (error) {
    console.warn(
      `[liquipedia-history] failed ${index + 1}/${selectedTeams.length} ${team.name}: ${String(error)}`,
    );
  }
}

for (const player of additions) rows.push(toRow(player));
const output =
  [headers.map(csvValue).join(",")]
    .concat(
      rows.map((row) =>
        headers.map((header) => csvValue(row[header] ?? "")).join(","),
      ),
    )
    .join("\n") + "\n";
await writeFile(outputPath, output, "utf8");

const reportRows = additions.map((player) =>
  [
    player.name,
    player.team.name,
    player.team.region,
    player.countryCode,
    player.joinDate,
    player.leaveDate,
    player.sourceUrl,
  ]
    .map(csvValue)
    .join(","),
);
const previousReport = await readFile(reportPath, "utf8").catch(() => "");
const reportHeader =
  "player_id,team,region,country_code,join_date,leave_date,source_url";
const previousLines = previousReport
  .split(/\r?\n/)
  .filter((line) => line && line !== reportHeader);
const uniqueReport = [...new Set([...previousLines, ...reportRows])];
await writeFile(
  reportPath,
  `${[reportHeader, ...uniqueReport].join("\n")}\n`,
  "utf8",
);
console.info(
  `Liquipedia historical sync complete: ${additions.length} new players; ${rows.length} total rows. Report: ${reportPath}`,
);
