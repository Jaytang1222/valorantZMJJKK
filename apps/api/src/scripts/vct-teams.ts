export type VctRegion = "americas" | "emea" | "pacific" | "china";

export type VctTeam = {
  region: VctRegion;
  id: number;
  slug: string;
  name: string;
};

// Tier-one teams included in the player database snapshot. The list is kept
// in one module so current and historical roster syncs cannot drift apart.
export const vctTeams: VctTeam[] = [
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
  { region: "emea", id: 18019, slug: "ulf-esports", name: "ULF Esports" },
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
  { region: "pacific", id: 12446, slug: "slt-seongnam", name: "SLT Seongnam" },
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
