import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";

type CsvRow = Record<string, string>;
type LeagueEvent = { path: string; title: string };
type LeagueEvidence = {
  eventPath: string;
  eventTitle: string;
  finalPath: string;
  winnerTeam: string;
  players: string[];
};

const csvPath = process.argv[2] ?? "../../data/players.seed.csv";
const reportPath =
  process.env.LEAGUE_TITLES_REPORT ?? "../../data/league-titles-report.json";
const asOf = process.env.LEAGUE_TITLES_AS_OF ?? "2026-08-23";
const checkedAt = `${asOf}T00:00:00.000Z`;
const pageCount = Math.max(1, Number(process.env.VLR_EVENT_PAGES ?? "59"));
const concurrency = Math.max(
  1,
  Math.min(6, Number(process.env.VLR_EVENT_CONCURRENCY ?? "4")),
);
const userAgent =
  process.env.VLR_USER_AGENT ??
  "KangYiBa league-title audit/1.0 (public-data-maintenance)";

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += char;
  }
  values.push(value);
  return values;
}

function csvValue(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function decode(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&ndash;", "-")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": userAgent },
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isLeagueTitle(title: string): boolean {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (!/^(?:VCT|Champions Tour) 20(?:2[3-9]|3\d):/i.test(normalized))
    return false;
  if (!/(Americas|EMEA|Pacific|China)/i.test(normalized)) return false;
  if (!/(Kickoff|Stage 1|Stage 2|League)/i.test(normalized)) return false;
  return !/(Masters|Champions|Challengers|Ascension|OFF\/\/SEASON)/i.test(
    normalized,
  );
}

function discoverEvents(html: string): LeagueEvent[] {
  const events: LeagueEvent[] = [];
  const cardPattern = /href="(\/event\/[^\"]+)"[^>]*>/g;
  for (const match of html.matchAll(cardPattern)) {
    const start = match.index ?? 0;
    const end = Math.min(html.length, start + 1200);
    const title = html
      .slice(start, end)
      .match(/event-item-title">\s*([^<]+)/)?.[1];
    if (!title) continue;
    const cleanTitle = decode(title);
    if (isLeagueTitle(cleanTitle))
      events.push({ path: match[1], title: cleanTitle });
  }
  return events;
}

function extractFinal(html: string): {
  path: string;
  winnerTeam: string;
} | null {
  const candidates = [
    ...html.matchAll(
      /<a class="bracket-item[^>]*mod-last[^>]*"[^>]*href="([^"]+)"[\s\S]*?<\/a>/g,
    ),
  ];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const block = candidate[0];
    const timestamp = Number(block.match(/data-utc-ts="(\d+)"/)?.[1] ?? "0");
    if (timestamp && timestamp * 1000 > Date.now()) continue;
    const winner = block.match(
      /bracket-item-team[^>]*mod-winner[^>]*>[\s\S]*?bracket-item-team-name[^>]*>[\s\S]*?<span>([^<]+)<\/span>/,
    )?.[1];
    if (winner) return { path: candidate[1], winnerTeam: decode(winner) };
  }
  return null;
}

function teamTags(team: string): Set<string> {
  const known: Record<string, string[]> = {
    "100 Thieves": ["100T"],
    "Bilibili Gaming": ["BLG"],
    "DetonatioN FocusMe": ["DFM"],
    "EDward Gaming": ["EDG"],
    "Edward Gaming": ["EDG"],
    "Fire Flux Esports": ["FFE", "FF"],
    "FunPlus Phoenix": ["FPX"],
    "Gen.G": ["GEN", "GENG"],
    "G2 Esports": ["G2"],
    GIANTX: ["GX"],
    "Gentle Mates": ["M8"],
    "KRU Esports": ["KRU", "KRÜ"],
    "KRÜ Esports": ["KRU", "KRÜ"],
    Leviatán: ["LEV"],
    "Natus Vincere": ["NAVI"],
    "Paper Rex": ["PRX"],
    "Rex Regum Qeon": ["RRQ"],
    Sentinels: ["SEN"],
    "Team Heretics": ["TH"],
    "Team Liquid": ["TL"],
    TYLOO: ["TYL"],
    "Wolves Esports": ["WOL"],
    "Xi Lai Gaming": ["XLG"],
  };
  const tags = new Set(known[team] ?? []);
  const compact = team.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (compact) tags.add(compact);
  const initials = team
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  if (initials.length >= 2) tags.add(initials);
  return tags;
}

function extractWinnerPlayers(html: string, winnerTeam: string): string[] {
  const tags = teamTags(winnerTeam);
  const players = new Set<string>();
  const pattern =
    /<div class="ovw-player">[\s\S]*?href="\/player\/[^\"]+\/([^\"]+)"[\s\S]*?<div class="ovw-player-tag[^>]*>([^<]+)<\/div>[\s\S]*?<\/div>/g;
  for (const match of html.matchAll(pattern)) {
    const slug = decode(match[1]);
    const tag = decode(match[2]);
    if (tags.has(tag) || tags.has(tag.toUpperCase())) players.add(slug);
  }
  return [...players];
}

async function mapWithConcurrency<T, R>(
  values: T[],
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const result: R[] = [];
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await worker(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, run),
  );
  return result;
}

const rawCsv = (await readFile(csvPath, "utf8"))
  .replace(/^\uFEFF/, "")
  .trimEnd()
  .split(/\r?\n/);
const headers = parseCsvLine(rawCsv[0]);
if (!headers.includes("league_titles"))
  throw new Error(
    "CSV must contain league_titles; old appearance data is not accepted",
  );
const rows = rawCsv.slice(1).map((line) => {
  const values = parseCsvLine(line);
  return Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""]),
  ) as CsvRow;
});
const playerByName = new Map<string, CsvRow>();
for (const row of rows) {
  for (const name of [row.canonical_name, ...(row.aliases ?? "").split("|")]) {
    const key = normalize(name);
    if (key) playerByName.set(key, row);
  }
  row.league_titles = "0";
}

const pages = await mapWithConcurrency(
  Array.from({ length: pageCount }, (_, index) => index + 1),
  async (page) => fetchText(`https://www.vlr.gg/events/?page=${page}`),
);
const events = [
  ...new Map(
    pages.flatMap(discoverEvents).map((event) => [event.path, event] as const),
  ).values(),
];
console.info(`[league] discovered ${events.length} official league events`);

const evidence: LeagueEvidence[] = [];
const failures: string[] = [];
for (let index = 0; index < events.length; index += 1) {
  const event = events[index];
  try {
    const eventHtml = await fetchText(`https://www.vlr.gg${event.path}`);
    const final = extractFinal(eventHtml);
    if (!final) {
      failures.push(`${event.path}: no completed final`);
      continue;
    }
    const matchHtml = await fetchText(`https://www.vlr.gg${final.path}`);
    const slugs = extractWinnerPlayers(matchHtml, final.winnerTeam);
    if (!slugs.length) {
      failures.push(
        `${event.path}: winner ${final.winnerTeam} roster not found`,
      );
      continue;
    }
    evidence.push({
      eventPath: event.path,
      eventTitle: event.title,
      finalPath: final.path,
      winnerTeam: final.winnerTeam,
      players: slugs,
    });
    for (const slug of slugs) {
      const row = playerByName.get(normalize(slug));
      if (row) row.league_titles = String(Number(row.league_titles) + 1);
    }
  } catch (error) {
    failures.push(`${event.path}: ${String(error)}`);
  }
  if ((index + 1) % 10 === 0 || index + 1 === events.length)
    console.info(`[league] processed ${index + 1}/${events.length} events`);
}

const output = [headers.map(csvValue).join(",")];
for (const row of rows)
  output.push(headers.map((header) => csvValue(row[header] ?? "")).join(","));
await writeFile(csvPath, `${output.join("\n")}\n`, "utf8");
await writeFile(
  reportPath,
  `${JSON.stringify(
    {
      asOf,
      source: "VLR event archive and completed final match pages",
      definition:
        "Official VCT Americas, EMEA, Pacific, and China Kickoff/Stage 1/Stage 2/League champions; excludes Masters, Champions, Challengers, Ascension, and OFF//SEASON.",
      events: evidence,
      failures,
      matchedPlayers: rows.filter((row) => Number(row.league_titles) > 0)
        .length,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
console.info(
  `[league] wrote ${reportPath}; ${evidence.length} events, ${failures.length} failures`,
);
