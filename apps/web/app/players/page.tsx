"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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

type PlayerDetails = Player & {
  age: number;
  isActiveRoster: boolean;
  championsTitles: number;
  mastersTitles: number;
  leagueTitles: number;
};

const detailFields = [
  ["region", "col.region"],
  ["country", "col.country"],
  ["age", "col.age"],
  ["status", "col.status"],
  ["primaryRole", "col.role"],
  ["currentOrLastTeam", "col.team"],
  ["championsTitles", "col.championsTitles"],
  ["mastersTitles", "col.mastersTitles"],
  ["leagueTitles", "col.leagueTitles"],
] as const;

function detailValue(
  field: (typeof detailFields)[number][0],
  player: PlayerDetails,
  locale: "zh" | "en",
) {
  if (field === "region") return formatRegion(player.region);
  if (field === "country") return formatCountry(player.countryCode, locale);
  if (field === "age") return player.age;
  if (field === "status")
    return t(
      locale,
      player.isActiveRoster ? "status.active" : "status.retired",
    );
  if (field === "primaryRole") return formatRole(player.primaryRole, locale);
  if (field === "currentOrLastTeam")
    return formatTeam(player.currentOrLastTeam);
  return player[field];
}

export default function PlayersPage() {
  const { locale } = useLocale();
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [details, setDetails] = useState<PlayerDetails | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/players?limit=5000", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Player[]>;
      })
      .then(setPlayers)
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(t(locale, "players.error"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [locale]);

  useEffect(() => {
    if (!selectedPlayer) return;
    const controller = new AbortController();
    setDetails(null);
    setDetailsError("");
    setDetailsLoading(true);
    fetch(`/api/players/${selectedPlayer.id}`, { signal: controller.signal })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("details")),
      )
      .then((data) => setDetails(data))
      .catch(() => {
        if (!controller.signal.aborted)
          setDetailsError(t(locale, "players.detailsError"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailsLoading(false);
      });
    return () => controller.abort();
  }, [locale, selectedPlayer]);

  function closeDetails() {
    setSelectedPlayer(null);
    setDetails(null);
    setDetailsError("");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!selectedPlayer) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetails();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedPlayer]);

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

  function openDetails(player: Player, trigger: HTMLElement) {
    triggerRef.current = trigger;
    setSelectedPlayer(player);
  }

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
        <p className="data-disclaimer">{t(locale, "players.issueNotice")}</p>
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
        {loading && (
          <p className="loading-state" role="status">
            {t(locale, "players.loading")}
          </p>
        )}
        {!error && !loading && (
          <p className="results-count">
            {tWith(locale, "players.count", { count: results.length })}
          </p>
        )}
        <div className="player-results" aria-busy={loading}>
          {results.map((player) => (
            <article
              className="player-card"
              key={player.id}
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              aria-label={tWith(locale, "players.openDetails", {
                name: player.canonicalName,
              })}
              onClick={(event) => openDetails(player, event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openDetails(player, event.currentTarget);
                }
              }}
            >
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
        {!error && !loading && results.length === 0 && (
          <p className="empty-state">{t(locale, "players.empty")}</p>
        )}
      </section>
      {mounted &&
        selectedPlayer &&
        createPortal(
          <div
            className="player-details-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeDetails();
            }}
          >
            <section
              className="player-details-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="player-details-dialog-title"
              aria-busy={detailsLoading}
            >
              <header className="player-details-dialog-header">
                <div>
                  <p className="eyebrow">PLAYER // INTEL</p>
                  <h2 id="player-details-dialog-title">
                    {tWith(locale, "players.detailsTitle", {
                      name: selectedPlayer.canonicalName,
                    })}
                  </h2>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="icon-button"
                  aria-label={t(locale, "players.closeDetails")}
                  onClick={closeDetails}
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </header>
              <div className="player-details-dialog-body">
                {detailsLoading && <p>{t(locale, "players.detailsLoading")}</p>}
                {detailsError && <p className="form-error">{detailsError}</p>}
                {details && (
                  <dl className="player-details-grid">
                    {detailFields.map(([field, label]) => (
                      <div key={field}>
                        <dt>{t(locale, label)}</dt>
                        <dd>{detailValue(field, details, locale)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </section>
          </div>,
          document.body,
        )}
    </main>
  );
}
