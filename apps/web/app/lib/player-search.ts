export interface SearchablePlayer {
  canonicalName: string;
  aliases?: string[];
}

export function rankPlayer(
  player: SearchablePlayer,
  query: string,
  extraFields: string[] = [],
): number {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return Infinity;
  const name = player.canonicalName.toLocaleLowerCase();
  const aliases = (player.aliases ?? []).map((alias) =>
    alias.toLocaleLowerCase(),
  );
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (aliases.some((alias) => alias.startsWith(q))) return 2;
  if (extraFields.some((field) => field.toLocaleLowerCase().startsWith(q)))
    return 3;
  return Infinity;
}

export function searchPlayers<T extends SearchablePlayer>(
  players: T[],
  query: string,
  limit: number,
  extraFields?: (player: T) => string[],
  minLength = 1,
): T[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q || q.length < minLength) return [];
  return players
    .map((player) => ({
      player,
      rank: rankPlayer(player, q, extraFields?.(player) ?? []),
    }))
    .filter(({ rank }) => rank !== Infinity)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ player }) => player);
}