"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatCountry,
  formatRegion,
  formatRole,
  formatTeam,
} from "../lib/display";
import { searchPlayers } from "../lib/player-search";

type Player = {
  id: string;
  canonicalName: string;
  countryCode: string;
  region: string;
  primaryRole: string;
  currentOrLastTeam: string;
  dataAsOf: string;
  aliases?: string[];
};
export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/players")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setPlayers)
      .catch(() => setError("暂时无法加载选手资料。"));
  }, []);
  const results = useMemo(
    () =>
      searchPlayers(players, query, 250, (player) =>
        [player.countryCode, player.region, player.primaryRole, player.currentOrLastTeam].join(" "),
      ),
    [players, query],
  );
  return (
    <main className="game-shell">
      <header className="game-header">
        <a href="/">康一把</a>
        <a href="/solo">单人对战</a>
      </header>
      <section className="game-intro">
        <p className="eyebrow">PLAYER DIRECTORY</p>
        <h1>查选手</h1>
        <p>浏览已审核公开资料。</p>
      </section>
      <section className="player-directory">
        <label>
          搜索选手、战队或赛区
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例如：Jett、KR、Gen.G"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        {!error && <p className="results-count">共 {results.length} 名选手</p>}
        <div className="player-results">
          {results.map((player) => (
            <article key={player.id}>
              <h2>{player.canonicalName}</h2>
              <p>{formatTeam(player.currentOrLastTeam)}</p>
              <dl>
                <div>
                  <dt>赛区</dt>
                  <dd>{formatRegion(player.region)}</dd>
                </div>
                <div>
                  <dt>国籍</dt>
                  <dd>{formatCountry(player.countryCode)}</dd>
                </div>
                <div>
                  <dt>位置</dt>
                  <dd>{formatRole(player.primaryRole)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        {!error && results.length === 0 && (
          <p className="empty-state">未找到符合条件的选手。</p>
        )}
      </section>
    </main>
  );
}
