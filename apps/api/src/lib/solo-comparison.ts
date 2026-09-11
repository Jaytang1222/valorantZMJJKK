type Snapshot = {
  region: string;
  countryCode: string;
  countryGroupCode: string;
  age: number;
  primaryRole: string;
  playerRoles?: string[];
  currentOrLastTeam: string;
  isActiveRoster: boolean;
  championsTitles: number;
  mastersTitles: number;
  leagueTitles: number;
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
    age:
      guess.age === target.age
        ? "equal"
        : guess.age < target.age
          ? "higher"
          : "lower",
    primaryRole: (guess.playerRoles ?? [guess.primaryRole]).some((role) =>
      (target.playerRoles ?? [target.primaryRole]).includes(role),
    )
      ? "exact"
      : "mismatch",
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
    leagueTitles:
      guess.leagueTitles === target.leagueTitles
        ? "equal"
        : guess.leagueTitles < target.leagueTitles
          ? "higher"
          : "lower",
  };
}
