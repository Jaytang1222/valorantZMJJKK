type Snapshot = {
  region: string;
  countryCode: string;
  countryGroupCode: string;
  primaryRole: string;
  currentOrLastTeam: string;
  isActiveRoster: boolean;
  championsTitles: number;
  mastersTitles: number;
  championsAppearances: number;
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
    status: text(
      guess.isActiveRoster ? "active" : "retired",
      target.isActiveRoster ? "active" : "retired",
    ),
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
    championsAppearances:
      guess.championsAppearances === target.championsAppearances
        ? "equal"
        : guess.championsAppearances < target.championsAppearances
          ? "higher"
          : "lower",
  };
}
