import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

type CsvRow = Record<string, string>;
type Team = {
  region: "americas" | "emea" | "pacific" | "china";
  id: number;
  slug: string;
  name: string;
};
type RosterPlayer = {
  id: string;
  slug: string;
  name: string;
  realName: string;
  countryCode: string;
  rosterStatus: "active" | "benched" | "inactive";
};

const asOf = "2026-08-20";
const checkedAt = "2026-08-20T12:00:00.000Z";
const outputPath = process.argv[2] ?? "../../data/players.seed.csv";

const manuallyVerifiedStatuses: Record<string, "benched" | "inactive"> = {
  "7135": "benched", // EDward Gaming: zjc
  "64029": "benched", // Bilibili Gaming: FT
  "62947": "inactive", // Bilibili Gaming: yilai
  "40845": "inactive", // Bilibili Gaming: Levius
  "64854": "benched", // TYLOO: xihe
  "64849": "benched", // Xi Lai Gaming: Sharks
  "39060": "benched", // Nova Esports: kodeth
  "34181": "benched", // Nova Esports: GREEN
  "5011": "benched", // Trace Esports: Abo
  "66427": "benched", // Trace Esports: Toosy
  "4881": "benched", // Titan Esports Club: Spitfires
  "4705": "inactive", // Dragon Ranger Gaming: Flex1n
};

const beginnerFeaturedTeams = new Set([
  "NRG",
  "LEVIATÁN",
  "MIBR",
  "Kiwoom DRX",
  "GIANTX",
  "Natus Vincere",
  "Team Heretics",
  "Gentle Mates",
  "Gen.G",
  "Paper Rex",
]);

// The CN list includes the 2026 VCT CN teams not all shown in the current
// Stage 2 bracket, including BLG, which was missing from the previous seed.
const teams: Team[] = [
  { region: "americas", id: 1034, slug: "nrg", name: "NRG" },
  {
    region: "americas",
    id: 2359,
    slug: "leviatan",
    name: "LEVIATÁN",
  },
  { region: "americas", id: 188, slug: "cloud9", name: "Cloud9" },
  { region: "americas", id: 11001, slug: "m80", name: "M80" },
  { region: "americas", id: 7386, slug: "mibr", name: "MIBR" },
  {
    region: "americas",
    id: 5248,
    slug: "evil-geniuses",
    name: "Evil Geniuses",
  },
  { region: "americas", id: 427, slug: "envy", name: "ENVY" },
  { region: "americas", id: 2406, slug: "furia", name: "FURIA" },
  { region: "americas", id: 11058, slug: "g2-esports", name: "G2 Esports" },
  { region: "americas", id: 2, slug: "sentinels", name: "Sentinels" },
  { region: "americas", id: 2355, slug: "kr-esports", name: "KRÜ Esports" },
  { region: "americas", id: 23141, slug: "fluxo-w7m", name: "Fluxo W7M" },
  { region: "americas", id: 22142, slug: "bestia", name: "BESTIA" },
  {
    region: "americas",
    id: 15072,
    slug: "2game-esports",
    name: "2GAME Esports",
  },
  { region: "emea", id: 397, slug: "bbl-esports", name: "BBL Esports" },
  { region: "emea", id: 14419, slug: "giantx", name: "GIANTX" },
  {
    region: "emea",
    id: 4915,
    slug: "natus-vincere",
    name: "Natus Vincere",
  },
  {
    region: "emea",
    id: 1001,
    slug: "team-heretics",
    name: "Team Heretics",
  },
  {
    region: "emea",
    id: 12694,
    slug: "gentle-mates",
    name: "Gentle Mates",
  },
  { region: "emea", id: 2059, slug: "team-vitality", name: "Team Vitality" },
  { region: "emea", id: 8877, slug: "karmine-corp", name: "Karmine Corp" },
  { region: "emea", id: 474, slug: "team-liquid", name: "Team Liquid" },
  { region: "emea", id: 1184, slug: "fut-esports", name: "FUT Esports" },
  {
    region: "emea",
    id: 876,
    slug: "enterprise-esports",
    name: "Enterprise Esports",
  },
  {
    region: "emea",
    id: 14478,
    slug: "eintracht-frankfurt",
    name: "Eintracht Frankfurt",
  },
  {
    region: "emea",
    id: 20085,
    slug: "fire-flux-esports",
    name: "Fire Flux Esports",
  },
  { region: "emea", id: 2593, slug: "fnatic", name: "FNATIC" },
  {
    region: "emea",
    id: 18019,
    slug: "ulf-esports",
    name: "ULF Esports",
  },
  { region: "pacific", id: 6199, slug: "team-secret", name: "Team Secret" },
  {
    region: "pacific",
    id: 878,
    slug: "rex-regum-qeon",
    name: "Rex Regum Qeon",
  },
  { region: "pacific", id: 18299, slug: "qt-dig", name: "QTDIG" },
  {
    region: "pacific",
    id: 17167,
    slug: "xipto-esports",
    name: "XIPTO Esports",
  },
  { region: "pacific", id: 5448, slug: "zeta-division", name: "ZETA DIVISION" },
  {
    region: "pacific",
    id: 11060,
    slug: "nongshim-redforce",
    name: "Nongshim RedForce",
  },
  { region: "pacific", id: 4050, slug: "full-sense", name: "FULL SENSE" },
  { region: "pacific", id: 14, slug: "t1", name: "T1" },
  {
    region: "pacific",
    id: 278,
    slug: "detonation-focusme",
    name: "DetonatioN FocusMe",
  },
  { region: "pacific", id: 8185, slug: "kiwoom-drx", name: "Kiwoom DRX" },
  { region: "pacific", id: 17, slug: "gen-g", name: "Gen.G" },
  { region: "pacific", id: 624, slug: "paper-rex", name: "Paper Rex" },
  {
    region: "pacific",
    id: 19189,
    slug: "onside-gaming",
    name: "Onside Gaming",
  },
  {
    region: "pacific",
    id: 623,
    slug: "sharper-esports",
    name: "Sharper Esports",
  },
  {
    region: "pacific",
    id: 12446,
    slug: "slt-seongnam",
    name: "SLT Seongnam",
  },
  { region: "china", id: 1120, slug: "edward-gaming", name: "EDward Gaming" },
  {
    region: "china",
    id: 12010,
    slug: "bilibili-gaming",
    name: "Bilibili Gaming",
  },
  { region: "china", id: 731, slug: "tyloo", name: "TYLOO" },
  { region: "china", id: 13581, slug: "xi-lai-gaming", name: "Xi Lai Gaming" },
  { region: "china", id: 12064, slug: "nova-esports", name: "Nova Esports" },
  {
    region: "china",
    id: 11328,
    slug: "funplus-phoenix",
    name: "FunPlus Phoenix",
  },
  { region: "china", id: 13576, slug: "jd-gaming", name: "JD Gaming" },
  { region: "china", id: 1119, slug: "all-gamers", name: "All Gamers" },
  { region: "china", id: 12685, slug: "trace-esports", name: "Trace Esports" },
  {
    region: "china",
    id: 14137,
    slug: "titan-esports-club",
    name: "Titan Esports Club",
  },
  {
    region: "china",
    id: 13790,
    slug: "wolves-esports",
    name: "Wolves Esports",
  },
  {
    region: "china",
    id: 11981,
    slug: "dragon-ranger-gaming",
    name: "Dragon Ranger Gaming",
  },
];

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

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&ndash;/g, "-")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/gi, " ")
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

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function knownPlayer(rows: CsvRow[], roster: RosterPlayer): CsvRow | undefined {
  const aliases = new Set([normalize(roster.name), normalize(roster.realName)]);
  return rows.find((row) => {
    const rowAliases = [row.canonical_name, ...(row.aliases ?? "").split("|")];
    return rowAliases.some((alias) => aliases.has(normalize(alias)));
  });
}

function toRow(
  row: CsvRow | undefined,
  player: RosterPlayer,
  team: Team,
  featuredTeamNames: Set<string>,
): CsvRow {
  const existing = row ?? {};
  const current =
    player.rosterStatus === "active" || player.rosterStatus === "benched";
  const aliases = new Set(
    [
      player.realName,
      existing.canonical_name,
      ...(existing.aliases ?? "").split("|"),
    ]
      .map((value) => value?.trim())
      .filter(Boolean),
  );
  aliases.delete(player.name);
  return {
    canonical_name: player.name,
    aliases: [...aliases].join("|"),
    country_code: player.countryCode,
    country_group:
      existing.country_group || groupForCountry(player.countryCode),
    region: team.region,
    primary_role: existing.primary_role || "flex",
    current_or_last_team: team.name,
    roster_status: player.rosterStatus,
    is_active_roster: String(current),
    is_coach: "false",
    is_featured_team:
      featuredTeamNames.has(team.name) || existing.is_featured_team === "true"
        ? "true"
        : "false",
    is_vct_cn_team: String(team.region === "china"),
    champions_titles: existing.champions_titles || "0",
    masters_titles: existing.masters_titles || "0",
    champions_appearances: existing.champions_appearances || "0",
    data_as_of: asOf,
    source_url: `https://www.vlr.gg/team/${team.id}/${team.slug}`,
    source_checked_at: checkedAt,
    review_status: "approved",
  };
}

async function fetchRoster(team: Team): Promise<RosterPlayer[]> {
  const url = `https://www.vlr.gg/team/${team.id}/${team.slug}`;
  const html = await fetch(url, {
    headers: { "user-agent": "VALO-YIBA roster audit/1.0" },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.text();
  });
  const start = html.indexOf("Current");
  const end = html.indexOf('<div name="ranking">', start);
  const section = html.slice(start, end > start ? end : undefined);
  const staffIndex = section.search(
    /<div class="wf-module-label"[^>]*>\s*staff\s*<\/div>/i,
  );
  const playerSection =
    staffIndex >= 0 ? section.slice(0, staffIndex) : section;
  const pattern =
    /<div class="team-roster-item">\s*<a href="\/player\/(\d+)\/([^"?]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const players: RosterPlayer[] = [];
  for (const match of playerSection.matchAll(pattern)) {
    const body = match[3];
    const aliasMatch = body.match(
      /team-roster-item-name-alias">[\s\S]*?<\/i>\s*([^<]+?)\s*(?:<i|<\/div>)/,
    );
    const realMatch = body.match(
      /team-roster-item-name-real">\s*([\s\S]*?)\s*<\/div>/,
    );
    const countryMatch = body.match(/flag mod-([a-z]{2})/i);
    const statusMatch = body.match(
      /team-roster-item-name-role">\s*([^<]+?)\s*<\/div>/i,
    );
    const rosterLabel = statusMatch?.[1].trim().toLowerCase();
    if (!aliasMatch || !countryMatch) continue;
    players.push({
      id: match[1],
      slug: match[2],
      name: decodeHtml(aliasMatch[1]),
      realName: realMatch ? decodeHtml(realMatch[1]) : "",
      countryCode: countryMatch[1].toUpperCase(),
      rosterStatus:
        manuallyVerifiedStatuses[match[1]] ??
        (rosterLabel === "inactive"
          ? "inactive"
          : rosterLabel === "sub"
            ? "benched"
            : "active"),
    });
  }
  return players;
}

const input = await readFile(outputPath, "utf8");
const rows = parse(input, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
}) as CsvRow[];
const originalRows = [...rows];
const currentKeys = new Set<string>();
const outputRows = [...rows];
// A traffic-team flag is a team-level property. Older seed rows sometimes
// marked only one member, so carry any existing team marker to every roster
// member and add the explicitly configured beginner teams above.
const featuredTeamNames = new Set([
  ...beginnerFeaturedTeams,
  ...originalRows
    .filter((row) => row.is_featured_team === "true")
    .map((row) => row.current_or_last_team)
    .filter(Boolean),
]);

for (const team of teams) {
  const roster = await fetchRoster(team);
  for (const player of roster) {
    const existing = knownPlayer(originalRows, player);
    const next = toRow(existing, player, team, featuredTeamNames);
    const index = existing ? outputRows.indexOf(existing) : -1;
    if (index >= 0) outputRows[index] = next;
    else outputRows.push(next);
    currentKeys.add(normalize(next.canonical_name));
  }
}

// VLR occasionally changes display aliases for players without a real-name
// entry. Keep one canonical row so a repeated sync cannot create duplicates.
const uniqueRows = new Map<string, CsvRow>();
for (const row of outputRows) {
  const key = normalize(row.canonical_name);
  if (!uniqueRows.has(key)) uniqueRows.set(key, row);
}
outputRows.splice(0, outputRows.length, ...uniqueRows.values());

// Players that were in the previous VCT snapshot but are absent from every
// current roster remain searchable as historical transfer records.
for (const row of outputRows) {
  if (currentKeys.has(normalize(row.canonical_name))) continue;
  if (row.is_active_roster === "false") {
    row.roster_status = row.roster_status || "retired";
  } else {
    row.roster_status = "transferred";
    row.is_active_roster = "false";
    row.review_status = "approved";
  }
}

const csv =
  [headers.map(csvValue).join(",")]
    .concat(
      outputRows.map((row) =>
        headers.map((header) => csvValue(row[header] ?? "")).join(","),
      ),
    )
    .join("\n") + "\n";
await writeFile(outputPath, csv, "utf8");
console.info(
  `Synchronized ${teams.length} teams and ${currentKeys.size} current roster players; wrote ${outputRows.length} rows.`,
);
