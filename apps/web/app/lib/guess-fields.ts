export type GuessFieldKey =
  | "region"
  | "country"
  | "age"
  | "status"
  | "primaryRole"
  | "currentOrLastTeam"
  | "championsTitles"
  | "mastersTitles"
  | "leagueTitles";

export type GuessField = readonly [GuessFieldKey, MessageKey];

/** The public comparison order. Keep this in sync with the API payload. */
export const GUESS_FIELDS: readonly GuessField[] = [
  ["region", "col.region"],
  ["country", "col.country"],
  ["age", "col.age"],
  ["status", "col.status"],
  ["primaryRole", "col.role"],
  ["currentOrLastTeam", "col.team"],
  ["championsTitles", "col.championsTitles"],
  ["mastersTitles", "col.mastersTitles"],
  ["leagueTitles", "col.leagueTitles"],
];

export function matchSymbol(tone: string | undefined) {
  if (tone === "higher") return "↑";
  if (tone === "lower") return "↓";
  return "";
}

export function toneLabel(tone: string | undefined) {
  if (tone === "exact" || tone === "equal") return "exact";
  if (tone === "nearby" || tone === "partial") return "nearby";
  if (tone === "higher" || tone === "lower") return "direction";
  return "mismatch";
}
import type { MessageKey } from "./i18n";
