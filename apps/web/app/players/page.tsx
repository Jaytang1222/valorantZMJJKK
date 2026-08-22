"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatCountry,
  formatRegion,
  formatRole,
  formatTeam,
  teamNames,
} from "../lib/display";
import { searchPlayers } from "../lib/player-search";
import { t, tWith } from "../lib/i18n";
import { useLocale } from "../components/ui-provider";

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
  const { locale } = useLocale();
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/players?limit=5000")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setPlayers)
      .catch(() => setError(t(locale, "players.error")));
  }, [locale]);
  const results = useMemo(
    () =>
      query.trim()
        ? searchPlayers(players, query, players.length, (player) => [
            player.countryCode,
            player.region,
            player.primaryRole,
            player.currentOrLastTeam,
            teamNames[player.currentOrLastTeam]?.short ?? "",
          ])
        : players,
    [players, query],
  );
  return (
    <main className="game-shell">
      <header className="game-header">
        <a href="/">{t(locale, "nav.brand")}</a>
        <a href="/solo">{t(locale, "home.entrySolo")}</a>
      </header>
      <section className="game-intro">
        <p className="eyebrow">PLAYER DIRECTORY</p>
        <h1>{t(locale, "home.entryDirectory")}</h1>
        <p>{t(locale, "players.lead")}</p>
      </section>
      <section className="player-directory">
        <label>
          {t(locale, "players.searchPlaceholder")}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(locale, "players.placeholder")}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        {!error && (
          <p className="results-count">
            {tWith(locale, "players.count", { count: results.length })}
          </p>
        )}
        <div className="player-results">
          {results.map((player) => (
            <article key={player.id}>
              <h2>{player.canonicalName}</h2>
              <p>{formatTeam(player.currentOrLastTeam)}</p>
              <dl>
                <div>
                  <dt>{t(locale, "col.region")}</dt>
                  <dd>{formatRegion(player.region)}</dd>
                </div>
                <div>
                  <dt>{t(locale, "col.country")}</dt>
                  <dd>{formatCountry(player.countryCode, locale)}</dd>
                </div>
                <div>
                  <dt>{t(locale, "col.role")}</dt>
                  <dd>{formatRole(player.primaryRole, locale)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        {!error && results.length === 0 && (
          <p className="empty-state">{t(locale, "players.empty")}</p>
        )}
      </section>
    </main>
  );
}
