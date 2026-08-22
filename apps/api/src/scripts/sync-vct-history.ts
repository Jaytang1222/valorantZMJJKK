import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { vctTeams, type VctTeam } from "./vct-teams.js";

type CsvRow = Record<string, string>;
type MatchLink = { id: string; slug: string };
type HistoricalPlayer = {
  id: string;
  slug: string;
  name: string;
  countryCode: string;
  team: VctTeam;
  sourceMatchUrl: string;
  appearances: number;
  realName?: string;
};

const outputPath = process.argv[2] ?? "../../data/players.seed.csv";
const reportPath =
  process.env.VCT_HISTORY_REPORT ??
  "../../data/vct-history-added.2026-08-22.csv";
const asOf = process.env.VCT_HISTORY_AS_OF ?? "2026-08-22";
const checkedAt = `${asOf}T12:00:00.000Z`;
const pageLimit = Number(process.env.VCT_HISTORY_PAGES ?? "0");
const maxMatchesPerTeam = Number(process.env.VCT_HISTORY_MAX_MATCHES ?? "0");
const requestedTeams = new Set(
  (process.env.VCT_HISTORY_TEAMS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const concurrency = Math.max(
  1,
  Math.min(12, Number(process.env.VCT_HISTORY_CONCURRENCY ?? "6")),
);
const requestDelayMs = Math.max(
  0,
  Number(process.env.VCT_HISTORY_REQUEST_DELAY_MS ?? "80"),
);
const maxAttempts = Math.max(
  1,
  Number(process.env.VCT_HISTORY_MAX_ATTEMPTS ?? "5"),
);
const userAgent =
  process.env.VCT_HISTORY_USER_AGENT ?? "KangYiBa roster audit/1.0";

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
  return value.trim().toLocaleLowerCase();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ndash;/g, "-")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function csvValue(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function groupForCountry(code: string): string {
  const groups: Record<string, string> = {
    CA: "north_america",
    US: "north_america",
    BR: "south_america",
    AR: "south_america",
    CL: "south_america",
    DE: "western_europe",
    DK: "northern_europe",
    EE: "northern_europe",
    ES: "southern_europe",
    FI: "northern_europe",
    FR: "western_europe",
    GB: "western_europe",
    LT: "northern_europe",
    MD: "eastern_europe",
    NL: "western_europe",
    PL: "eastern_europe",
    PT: "southern_europe",
    RO: "eastern_europe",
    RU: "eastern_europe",
    TR: "middle_east",
    EG: "middle_east",
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
    CH: "western_europe",
    RS: "eastern_europe",
    UN: "eastern_europe",
  };
  return groups[code] ?? "east_asia";
}

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": userAgent },
      });
      if (response.ok) {
        if (requestDelayMs > 0)
          await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
        return response.text();
      }
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`${response.status} ${url}`);
      }
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      const delay = Math.max(
        requestDelayMs,
        retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** (attempt - 1),
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(requestDelayMs, 250 * 2 ** (attempt - 1))),
      );
    }
  }
  throw new Error(`request attempts exhausted: ${url}`);
}

function extractMatchLinks(html: string): MatchLink[] {
  const links = new Map<string, MatchLink>();
  const pattern = /href="\/(\d+)\/([^"?]+)"/g;
  for (const match of html.matchAll(pattern)) {
    const slug = match[2];
    if (!slug.includes("-vs-")) continue;
    links.set(match[1], { id: match[1], slug });
  }
  return [...links.values()];
}

function extractTeamIds(html: string): {
  side1: string;
  side2: string;
} | null {
  const sides = [
    ...html.matchAll(
      /match-header-link[^>]*mod-(1|2)[^>]*href="\/team\/(\d+)\//g,
    ),
  ]
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((match) => match[2]);
  if (sides.length < 2) return null;
  return { side1: sides[0], side2: sides[1] };
}

type MatchPlayer = {
  id: string;
  slug: string;
  name: string;
  countryCode: string;
  tag: string;
};

function extractPlayersForSide(html: string, side: 1 | 2): MatchPlayer[] {
  const players: MatchPlayer[] = [];
  const rowPattern =
    /href="\/player\/(\d+)\/([^"?]+)"[\s\S]{0,700}?<div class="ovw-player-name[^>]*>\s*([^<]+?)\s*<\/div>[\s\S]{0,220}?<div class="ovw-player-tag[^>]*>\s*([^<]+?)\s*<\/div>/g;
  const rows = [...html.matchAll(rowPattern)].map((match) => ({
    id: match[1],
    slug: match[2],
    name: decodeHtml(match[3]),
    tag: decodeHtml(match[4]),
    countryCode: "UN",
  }));
  const tags: string[] = [];
  for (const row of rows) if (!tags.includes(row.tag)) tags.push(row.tag);
  const sideTag = tags[side - 1];
  const selected = sideTag ? rows.filter((row) => row.tag === sideTag) : [];
  for (const row of selected.length > 0
    ? selected
    : rows.slice(side === 1 ? 0 : 5, side === 1 ? 5 : undefined)) {
    players.push(row);
  }

  return [...new Map(players.map((player) => [player.id, player])).values()];
}

function attachCountryCodes(
  html: string,
  players: MatchPlayer[],
): MatchPlayer[] {
  // The flag is located in the same player block as the name. Matching by
  // player href keeps this resilient to VLR's whitespace and class changes.
  return players.map((player) => {
    const escaped = player.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = html.match(
      new RegExp(
        `href="/player/${escaped}/[^"]+"[\\s\\S]{0,280}?flag mod-([a-z]{2})`,
        "i",
      ),
    );
    return { ...player, countryCode: block?.[1]?.toUpperCase() ?? "UN" };
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  async function runWorker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      runWorker(),
    ),
  );
  return results;
}

async function collectMatches(team: VctTeam): Promise<MatchLink[]> {
  const links = new Map<string, MatchLink>();
  let page = 1;
  while (pageLimit === 0 || page <= pageLimit) {
    const url = `https://www.vlr.gg/team/matches/${team.id}/${team.slug}/?group=completed&page=${page}`;
    const html = await fetchText(url);
    for (const link of extractMatchLinks(html)) links.set(link.id, link);
    if (!html.includes('rel="next"')) break;
    page += 1;
  }
  const values = [...links.values()];
  return maxMatchesPerTeam > 0 ? values.slice(0, maxMatchesPerTeam) : values;
}

const csv = await readFile(outputPath, "utf8");
const rows = parse(csv, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
}) as CsvRow[];
const knownNames = new Set<string>();
for (const row of rows) {
  knownNames.add(normalize(row.canonical_name));
  for (const alias of (row.aliases ?? "").split("|")) {
    if (alias) knownNames.add(normalize(alias));
  }
}

const selectedTeams =
  requestedTeams.size === 0
    ? vctTeams
    : vctTeams.filter(
        (team) =>
          requestedTeams.has(String(team.id)) || requestedTeams.has(team.slug),
      );
const teamMatches = new Map<string, MatchLink[]>();
for (const [index, team] of selectedTeams.entries()) {
  try {
    const links = await collectMatches(team);
    teamMatches.set(String(team.id), links);
    console.info(
      `[history] ${index + 1}/${selectedTeams.length} ${team.name}: ${links.length} matches`,
    );
  } catch (error) {
    console.warn(`[history] failed to list ${team.name}: ${String(error)}`);
  }
}

const matchTeams = new Map<string, VctTeam[]>();
for (const team of selectedTeams) {
  for (const match of teamMatches.get(String(team.id)) ?? []) {
    const teams = matchTeams.get(match.id) ?? [];
    if (!teams.some((item) => item.id === team.id)) teams.push(team);
    matchTeams.set(match.id, teams);
  }
}

const matches = [...matchTeams.entries()];
const matchById = new Map<string, MatchLink>();
for (const links of teamMatches.values()) {
  for (const link of links) matchById.set(link.id, link);
}
const discovered = new Map<string, HistoricalPlayer>();
await mapWithConcurrency(matches, async ([matchId, teams], index) => {
  const match = matchById.get(matchId);
  if (!match) return;
  try {
    const url = `https://www.vlr.gg/${match.id}/${match.slug}`;
    const html = await fetchText(url);
    const sides = extractTeamIds(html);
    if (!sides) return;
    for (const team of teams) {
      const side =
        sides.side1 === String(team.id)
          ? 1
          : sides.side2 === String(team.id)
            ? 2
            : 0;
      if (!side) continue;
      const players = attachCountryCodes(
        html,
        extractPlayersForSide(html, side as 1 | 2),
      );
      for (const player of players) {
        const key = player.id;
        const previous = discovered.get(key);
        discovered.set(key, {
          id: player.id,
          slug: player.slug,
          name: player.name,
          countryCode: player.countryCode,
          team: previous?.team ?? team,
          sourceMatchUrl: previous?.sourceMatchUrl ?? url,
          appearances: (previous?.appearances ?? 0) + 1,
        });
      }
    }
    if ((index + 1) % 25 === 0) {
      console.info(
        `[history] matches ${index + 1}/${matches.length}; players ${discovered.size}`,
      );
    }
  } catch (error) {
    console.warn(`[history] failed match ${match.id}: ${String(error)}`);
  }
});

const additions = [...discovered.values()].filter(
  (player) => !knownNames.has(normalize(player.name)),
);
const enrichedAdditions = await mapWithConcurrency(
  additions,
  async (player) => {
    try {
      const profileUrl = `https://www.vlr.gg/player/${player.id}/${player.slug}`;
      const html = await fetchText(profileUrl);
      const realName = decodeHtml(
        html.match(
          /player-header-item-name-real">\s*([^<]+?)\s*<\/div>/i,
        )?.[1] ??
          html.match(
            /<meta name="description" content="[^(]+\(([^)]+)\)/i,
          )?.[1] ??
          "",
      );
      const countryCode =
        html
          .match(
            /player-header-item-name-alias[\s\S]{0,200}?flag mod-([a-z]{2})/i,
          )?.[1]
          ?.toUpperCase() ?? player.countryCode;
      return {
        ...player,
        countryCode,
        realName: realName && realName !== player.name ? realName : undefined,
      };
    } catch (error) {
      console.warn(
        `[history] failed player profile ${player.id}: ${String(error)}`,
      );
      return player;
    }
  },
);
for (const player of enrichedAdditions) {
  const sourceUrl = `https://www.vlr.gg/player/${player.id}/${player.slug}`;
  rows.push({
    canonical_name: player.name,
    aliases: player.realName ?? "",
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
    champions_appearances: "0",
    data_as_of: asOf,
    source_url: sourceUrl,
    source_checked_at: checkedAt,
    review_status: "approved",
  });
}

const output =
  [headers.join(",")]
    .concat(
      rows.map((row) =>
        headers.map((header) => csvValue(row[header] ?? "")).join(","),
      ),
    )
    .join("\n") + "\n";
await writeFile(outputPath, output, "utf8");

const report = [
  "player_id,team,region,vlr_player_url,source_match_url,appearances",
  ...enrichedAdditions.map((player) =>
    [
      player.name,
      player.team.name,
      player.team.region,
      `https://www.vlr.gg/player/${player.id}/${player.slug}`,
      player.sourceMatchUrl,
      String(player.appearances),
    ]
      .map(csvValue)
      .join(","),
  ),
  "",
].join("\n");
await writeFile(reportPath, report, "utf8");

console.info(
  `Historical sync complete: ${enrichedAdditions.length} new players; ${rows.length} total rows. Report: ${reportPath}`,
);
