"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatCountry,
  formatRegion,
  formatRole,
  formatTeam,
} from "../lib/display";
import { searchPlayers } from "../lib/player-search";
import { t, tWith } from "../lib/i18n";
import { GUESS_FIELDS, matchSymbol, toneLabel } from "../lib/guess-fields";
import { useLocale } from "../components/ui-provider";

type Difficulty = "beginner" | "easy" | "full";
type Region = "china" | "americas" | "emea" | "pacific";
type Player = {
  id: string;
  canonicalName: string;
  currentOrLastTeam: string;
  aliases?: string[];
};
type PlayerDetails = {
  region: string;
  countryCode: string;
  age?: number;
  primaryRole: string;
  currentOrLastTeam: string;
  isActiveRoster: boolean;
  championsTitles: number;
  mastersTitles: number;
  leagueTitles: number;
};
type Guess = {
  canonicalName: string;
  isCorrect: boolean;
  comparison: Record<string, string>;
  details?: PlayerDetails;
};
type Attempt = {
  id: string;
  difficulty: Difficulty;
  status: "active" | "won" | "lost" | "abandoned";
  guessCount: number;
  score?: number | null;
};

function guestId() {
  const key = "valo_guest_id";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

function valueFor(column: string, guess: Guess, locale: "zh" | "en") {
  const details = guess.details;
  if (!details) return "—";
  if (column === "region") return formatRegion(details.region);
  if (column === "country") return formatCountry(details.countryCode, locale);
  if (column === "age")
    return guess.comparison.age ? (details.age ?? "—") : "—";
  if (column === "status")
    return t(
      locale,
      details.isActiveRoster ? "status.active" : "status.retired",
    );
  if (column === "primaryRole") return formatRole(details.primaryRole, locale);
  if (column === "currentOrLastTeam")
    return formatTeam(details.currentOrLastTeam);
  if (column === "championsTitles") return details.championsTitles;
  if (column === "mastersTitles") return details.mastersTitles;
  if (column === "leagueTitles") return details.leagueTitles;
  return "—";
}

export default function SoloPage() {
  const { locale } = useLocale();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Player | null>(null);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(-1);
  const [showCandidates, setShowCandidates] = useState(true);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [result, setResult] = useState<{
    target: { canonicalName: string };
    score: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    const savedAttemptId = localStorage.getItem("valo_solo_attempt_id");
    if (savedAttemptId)
      fetch(`/api/solo/attempts/${savedAttemptId}?guestId=${guestId()}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data) {
            setAttempt(data.attempt);
            setGuesses(data.guesses);
            setResult(data.result ?? null);
          } else localStorage.removeItem("valo_solo_attempt_id");
        })
        .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => setDisplayName(data.user?.displayName ?? null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Search against the complete approved directory. A 250-row prefix
    // misses valid IDs such as ZmjjKK because the API sorts by canonical name.
    fetch("/api/players?limit=5000", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then(setPlayers)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const candidates = useMemo(() => {
    if (!query.trim() || selected) return [];
    return searchPlayers(players, query, 250);
  }, [players, query, selected]);

  useEffect(() => {
    setActiveCandidateIndex(-1);
  }, [query, selected]);

  const columns = useMemo(
    () =>
      GUESS_FIELDS.map(([field, label]) => [field, t(locale, label)] as const),
    [locale],
  );

  async function start(difficulty: Difficulty) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/solo/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ difficulty, guestId: guestId() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      localStorage.setItem("valo_solo_attempt_id", data.attempt.id);
      setAttempt(data.attempt);
      setGuesses([]);
      setResult(null);
      setSelected(null);
      setQuery("");
      setActiveCandidateIndex(-1);
      setShowCandidates(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t(locale, "solo.errorStart"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!attempt || !selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/solo/attempts/${attempt.id}/guesses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: selected.id, guestId: guestId() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setGuesses((items) => [...items, data.guess]);
      setAttempt(data.attempt);
      setResult(data.result ?? null);
      if (data.result) localStorage.removeItem("valo_solo_attempt_id");
      setSelected(null);
      setQuery("");
      setActiveCandidateIndex(-1);
      setShowCandidates(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t(locale, "solo.errorSubmit"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function abandon() {
    if (!attempt || !confirm(t(locale, "solo.confirmAbandon"))) return;
    const response = await fetch(`/api/solo/attempts/${attempt.id}/abandon`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guestId: guestId() }),
    });
    const data = await response.json();
    if (response.ok) {
      localStorage.removeItem("valo_solo_attempt_id");
      setAttempt(data.attempt);
      setResult(data.result);
    } else setError(data.error ?? t(locale, "solo.errorAbandon"));
  }

  const difficultyLabels: Record<Difficulty, string> = {
    beginner: t(locale, "solo.diffBeginner"),
    easy: t(locale, "solo.diffEasy"),
    full: t(locale, "solo.diffFull"),
  };
  const regionLabels: Record<Region, string> = {
    china: t(locale, "solo.regionChina"),
    americas: t(locale, "solo.regionAmericas"),
    emea: t(locale, "solo.regionEmea"),
    pacific: t(locale, "solo.regionPacific"),
  };
  const regions: Region[] = ["china", "americas", "emea", "pacific"];
  const selectCandidate = (player: Player) => {
    setSelected(player);
    setQuery(player.canonicalName);
    setActiveCandidateIndex(-1);
    setShowCandidates(false);
  };

  return (
    <main className="game-shell solo-page">
      <header className="game-header solo-nav">
        <div className="solo-nav-left">
          <a href="/">{t(locale, "nav.brand")}</a>
          <span className="solo-nav-mode">SOLO ALPHA</span>
        </div>
        <div className="solo-nav-right">
          {attempt && (
            <>
              <span className="solo-nav-difficulty">
                {difficultyLabels[attempt.difficulty]}
              </span>
              <strong className="solo-nav-count">
                {tWith(locale, "solo.guessesLeft", {
                  used: attempt.guessCount,
                })}
              </strong>
              {attempt.status === "active" && (
                <button className="text-button" onClick={abandon}>
                  {t(locale, "solo.abandon")}
                </button>
              )}
            </>
          )}
          {displayName ? (
            <a href="/account">{displayName}</a>
          ) : (
            <a href="/login">{t(locale, "login.title")}</a>
          )}
        </div>
      </header>
      {!attempt && (
        <>
          <section className="game-intro">
            <p className="eyebrow">SOLO ALPHA</p>
            <h1>{t(locale, "home.entrySolo")}</h1>
            <p>{t(locale, "solo.lead")}</p>
            <p className="data-disclaimer">{t(locale, "solo.dataNotice")}</p>
          </section>
          <section
            className="difficulty-grid"
            aria-label={t(locale, "home.entrySolo")}
          >
            {(["beginner", "easy", "full"] as Difficulty[]).map(
              (difficulty) => (
                <button
                  key={difficulty}
                  disabled={busy}
                  onClick={() => start(difficulty)}
                >
                  <strong>{difficultyLabels[difficulty]}</strong>
                  <span>{t(locale, "solo.startAction")}</span>
                </button>
              ),
            )}
            {regions.map((region) => (
              <div className="region-card" key={region} aria-disabled="true">
                <strong>{regionLabels[region]}</strong>
                <span>{t(locale, "solo.regionComingSoon")}</span>
                <label>
                  <input type="checkbox" disabled />
                  {t(locale, "solo.regionActiveOnly")}
                </label>
              </div>
            ))}
          </section>
        </>
      )}
      {attempt && (
        <section className="game-board">
          <div className="solo-board-toolbar">
            <div>
              <p className="eyebrow">SOLO // INTEL GRID</p>
              <h1>{difficultyLabels[attempt.difficulty]}</h1>
            </div>
            <span className="solo-board-counter">
              {tWith(locale, "solo.guessesLeft", { used: attempt.guessCount })}
            </span>
          </div>
          <p className="data-disclaimer">{t(locale, "solo.dataNotice")}</p>
          <div
            className="comparison-legend"
            aria-label={t(locale, "match.fieldLegend")}
          >
            <span data-legend="exact">
              <i aria-hidden="true" />
              {t(locale, "legend.exact")}
            </span>
            <span data-legend="nearby">
              <i aria-hidden="true" />
              {t(locale, "legend.nearby")}
            </span>
            <span data-legend="mismatch">
              <i aria-hidden="true" />
              {t(locale, "legend.mismatch")}
            </span>
            <span data-legend="direction">
              <i aria-hidden="true">↕</i>
              {t(locale, "legend.direction")}
            </span>
          </div>
          <div
            className="guess-table-wrap"
            aria-label={t(locale, "solo.tableLabel")}
          >
            <div className="guess-table guess-table-header">
              <span>{t(locale, "col.guess")}</span>
              {columns.map(([, label]) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            {guesses.map((guess, index) => (
              <div
                className="guess-table"
                key={`${guess.canonicalName}-${index}`}
              >
                <strong className="guess-name">
                  {index + 1}. {guess.canonicalName}
                </strong>
                {columns.map(([key, label]) => {
                  const tone = guess.comparison[key];
                  return (
                    <span
                      key={key}
                      data-match={tone}
                      data-tone={toneLabel(tone)}
                      title={label}
                      aria-label={`${label}: ${valueFor(key, guess, locale)}`}
                    >
                      <small className="guess-cell-label">{label}</small>
                      {valueFor(key, guess, locale)} {matchSymbol(tone)}
                    </span>
                  );
                })}
              </div>
            ))}
            {guesses.length === 0 && (
              <p className="guess-table-empty">{t(locale, "solo.noGuesses")}</p>
            )}
          </div>
          {result && (
            <section className="result-panel">
              <p>
                {attempt.status === "won"
                  ? t(locale, "solo.won")
                  : attempt.status === "abandoned"
                    ? t(locale, "solo.abandoned")
                    : t(locale, "solo.end")}
              </p>
              <h2>
                {t(locale, "solo.answer")}
                {result.target.canonicalName}
              </h2>
              <strong>
                {tWith(locale, "solo.points", { score: result.score })}
              </strong>
              <button
                onClick={() => {
                  setAttempt(null);
                  setGuesses([]);
                  setResult(null);
                }}
              >
                {t(locale, "solo.playAgain")}
              </button>
            </section>
          )}
          {attempt.status === "active" && (
            <div className="guess-box guess-composer">
              <label>
                {t(locale, "solo.searchLabel")}
                <input
                  autoFocus
                  role="combobox"
                  value={query}
                  aria-expanded={
                    showCandidates &&
                    query.trim().length > 0 &&
                    candidates.length > 0
                  }
                  aria-controls="solo-player-listbox"
                  aria-activedescendant={
                    activeCandidateIndex >= 0
                      ? `solo-player-option-${activeCandidateIndex}`
                      : undefined
                  }
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelected(null);
                    setShowCandidates(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setActiveCandidateIndex(-1);
                      setShowCandidates(false);
                      return;
                    }
                    if (event.key === "Enter" && selected) {
                      event.preventDefault();
                      if (!busy) void submit();
                      return;
                    }
                    if (!candidates.length) return;
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setShowCandidates(true);
                      setActiveCandidateIndex(
                        (index) => (index + 1) % candidates.length,
                      );
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setShowCandidates(true);
                      setActiveCandidateIndex((index) =>
                        index <= 0 ? candidates.length - 1 : index - 1,
                      );
                    } else if (
                      event.key === "Enter" &&
                      activeCandidateIndex >= 0
                    ) {
                      event.preventDefault();
                      selectCandidate(candidates[activeCandidateIndex]);
                    }
                  }}
                  placeholder={t(locale, "solo.guessPlaceholder")}
                />
              </label>
              {showCandidates &&
                query &&
                !selected &&
                candidates.length > 0 && (
                  <div
                    className="candidate-list"
                    id="solo-player-listbox"
                    role="listbox"
                  >
                    {candidates.map((player, index) => (
                      <button
                        key={player.id}
                        id={`solo-player-option-${index}`}
                        role="option"
                        aria-selected={activeCandidateIndex === index}
                        data-active={activeCandidateIndex === index}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectCandidate(player)}
                      >
                        {player.canonicalName}
                        <small>{formatTeam(player.currentOrLastTeam)}</small>
                      </button>
                    ))}
                  </div>
                )}
              {selected && (
                <button
                  className="submit-guess"
                  disabled={busy}
                  onClick={submit}
                >
                  {t(locale, "solo.submit")}
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {error && <p className="form-error">{error}</p>}
    </main>
  );
}
