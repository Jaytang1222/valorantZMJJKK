export const countryNames: Record<string, string> = {
  CN: "中国",
  KR: "韩国",
  US: "美国",
  TR: "土耳其",
  BR: "巴西",
  RU: "俄罗斯",
  CA: "加拿大",
  JP: "日本",
  PL: "波兰",
  TW: "中国台湾",
  PH: "菲律宾",
  ID: "印度尼西亚",
  TH: "泰国",
  CL: "智利",
  CZ: "捷克",
  GB: "英国",
  DE: "德国",
  SG: "新加坡",
  AR: "阿根廷",
  FI: "芬兰",
  PT: "葡萄牙",
  RO: "罗马尼亚",
  FR: "法国",
  LT: "立陶宛",
  VN: "越南",
  MY: "马来西亚",
  BE: "比利时",
  MA: "摩洛哥",
  AU: "澳大利亚",
  HR: "克罗地亚",
  CH: "瑞士",
  MX: "墨西哥",
  HK: "中国香港",
  MD: "摩尔多瓦",
  CO: "哥伦比亚",
  RS: "塞尔维亚",
  IT: "意大利",
  IN: "印度",
};

export const regionNames: Record<string, string> = {
  china: "VCT-CN",
  pacific: "VCT-PACIFIC",
  emea: "VCT-EMEA",
  americas: "VCT-AMERICAS",
};

export const roleNames: Record<string, string> = {
  duelist: "决斗者",
  initiator: "先锋",
  controller: "控场者",
  sentinel: "哨位",
  flex: "灵活位",
  coach: "教练",
};

export const teamNames: Record<string, { full: string; short: string }> = {
  "100 Thieves": { full: "100 Thieves", short: "100T" },
  "All Gamers": { full: "All Gamers", short: "AG" },
  "BBL Esports": { full: "BBL Esports", short: "BBL" },
  "bleed eSports": { full: "Bleed Esports", short: "BLEED" },
  Cloud9: { full: "Cloud9", short: "C9" },
  "DetonatioN FocusMe": { full: "DetonatioN FocusMe", short: "DFM" },
  "Dragon Ranger Gaming": { full: "Dragon Ranger Gaming", short: "DRG" },
  DRX: { full: "DRX", short: "DRX" },
  "EDward Gaming": { full: "EDward Gaming", short: "EDG" },
  "Eintracht Frankfurt": { full: "Eintracht Frankfurt", short: "EFC" },
  "Enterprise Esports": { full: "Enterprise Esports", short: "ENT" },
  ENVY: { full: "ENVY", short: "ENVY" },
  "Eternal Fire": { full: "Eternal Fire", short: "EF" },
  "Evil Geniuses": { full: "Evil Geniuses", short: "EG" },
  FNATIC: { full: "FNATIC", short: "FNC" },
  "FULL SENSE": { full: "FULL SENSE", short: "FS" },
  "FunPlus Phoenix": { full: "FunPlus Phoenix", short: "FPX" },
  FURIA: { full: "FURIA", short: "FURIA" },
  "FUT Esports": { full: "FUT Esports", short: "FUT" },
  "G2 Esports": { full: "G2 Esports", short: "G2" },
  "Gen.G": { full: "Gen.G", short: "GEN" },
  "Gentle Mates": { full: "Gentle Mates", short: "GM" },
  GIANTX: { full: "GIANTX", short: "GX" },
  "Global Esports": { full: "Global Esports", short: "GE" },
  "JD Mall JDG Esports": { full: "JD Mall JDG Esports", short: "JDG" },
  Joblife: { full: "Joblife", short: "JL" },
  "KeepBest Gaming": { full: "KeepBest Gaming", short: "KBG" },
  "KIWOOM DRX": { full: "KIWOOM DRX", short: "DRX" },
  "KRÜ Esports": { full: "KRÜ Esports", short: "KRÜ" },
  "LEVIATÁN": { full: "LEVIATÁN", short: "LEV" },
  LOUD: { full: "LOUD", short: "LOUD" },
  MIBR: { full: "MIBR", short: "MIBR" },
  "Natus Vincere": { full: "Natus Vincere", short: "NAVI" },
  "Nongshim RedForce": { full: "Nongshim RedForce", short: "NS" },
  NRG: { full: "NRG", short: "NRG" },
  "Paper Rex": { full: "Paper Rex", short: "PRX" },
  "PCIFIC Esports": { full: "PCIFIC Esports", short: "PCIFIC" },
  REBORN: { full: "REBORN", short: "REBORN" },
  "Rex Regum Qeon": { full: "Rex Regum Qeon", short: "RRQ" },
  Sentinels: { full: "Sentinels", short: "SEN" },
  T1: { full: "T1", short: "T1" },
  "Team Heretics": { full: "Team Heretics", short: "TH" },
  "Team Liquid": { full: "Team Liquid", short: "TL" },
  "Team Secret": { full: "Team Secret", short: "TS" },
  "Team Vitality": { full: "Team Vitality", short: "VIT" },
  "Trace Esports": { full: "Trace Esports", short: "TE" },
  VARREL: { full: "VARREL", short: "VARREL" },
  "Wolves Esports": { full: "Wolves Esports", short: "WOL" },
  "Wuxi Titan Esports Club": {
    full: "Wuxi Titan Esports Club",
    short: "WXT",
  },
  "ZETA DIVISION": { full: "ZETA DIVISION", short: "ZETA" },
};

export function formatCountry(code: string): string {
  return countryNames[code.toUpperCase()] ?? code.toUpperCase();
}

export function formatRegion(region: string): string {
  return regionNames[region] ?? region;
}

export function formatRole(role: string): string {
  return roleNames[role] ?? role;
}

export function formatTeam(team: string): string {
  const known = teamNames[team];
  if (!known) return team;
  if (known.short === known.full) return known.full;
  return `${known.full} (${known.short})`;
}