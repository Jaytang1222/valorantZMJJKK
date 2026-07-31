type Snapshot = {
  region: string;
  countryCode: string;
  countryGroupCode: string;
  primaryRole: string;
  currentOrLastTeam: string;
  championsTitles: number;
  mastersTitles: number;
  heroTop3: [string, string, string];
};

export function compareSoloGuess(guess: Snapshot, target: Snapshot) {
  const text = (a: string, b: string) => (a === b ? "exact" : "mismatch");
  return {
    region: text(guess.region, target.region),
    country:
      guess.countryCode === target.countryCode
        ? "exact"
        : guess.countryGroupCode === target.countryGroupCode
          ? "nearby"
          : "mismatch",
    primaryRole: text(guess.primaryRole, target.primaryRole),
    currentOrLastTeam: text(guess.currentOrLastTeam, target.currentOrLastTeam),
    championsTitles:
      guess.championsTitles === target.championsTitles
        ? "equal"
        : guess.championsTitles < target.championsTitles
          ? "higher"
          : "lower",
    mastersTitles:
      guess.mastersTitles === target.mastersTitles
        ? "equal"
        : guess.mastersTitles < target.mastersTitles
          ? "higher"
          : "lower",
    heroTop3: guess.heroTop3.some((hero) => target.heroTop3.includes(hero))
      ? "partial"
      : "mismatch",
  };
}
