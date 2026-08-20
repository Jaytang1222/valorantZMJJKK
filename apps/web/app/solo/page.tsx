"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatCountry,
  formatRegion,
  formatRole,
  formatTeam,
} from "../lib/display";
import { searchPlayers } from "../lib/player-search";

type Difficulty = "beginner" | "easy" | "full";
type Player = {
  id: string;
  canonicalName: string;
  currentOrLastTeam: string;
  aliases?: string[];
};
type PlayerDetails = {
  region: string;
  countryCode: string;
  primaryRole: string;
  currentOrLastTeam: string;
  isActiveRoster: boolean;
  championsTitles: number;
  mastersTitles: number;
  championsAppearances: number;
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

const columns = [
  ["region", "赛区"],
  ["country", "国籍"],
  ["status", "状态"],
  ["primaryRole", "位置"],
  ["currentOrLastTeam", "队伍"],
  ["championsTitles", "冠军赛夺冠次数"],
  ["mastersTitles", "大师赛夺冠次数"],
  ["championsAppearances", "冠军赛入围次数"],
] as const;

const difficultyLabels: Record<Difficulty, string> = {
  beginner: "入门",
  easy: "简单",
  full: "完整",
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

function matchSymbol(tone: string | undefined) {
  if (tone === "higher") return "↑";
  if (tone === "lower") return "↓";
  return "";
}

function valueFor(column: string, guess: Guess) {
  const details = guess.details;
  if (!details) return "—";
  if (column === "region") return formatRegion(details.region);
  if (column === "country") return formatCountry(details.countryCode);
  if (column === "status") return details.isActiveRoster ? "现役" : "退役";
  if (column === "primaryRole") return formatRole(details.primaryRole);
  if (column === "currentOrLastTeam") return formatTeam(details.currentOrLastTeam);
  if (column === "championsTitles") return details.championsTitles;
  if (column === "mastersTitles") return details.mastersTitles;
  if (column === "championsAppearances") return details.championsAppearances;
  return "—";
}

export default function SoloPage() {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Player | null>(null);
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
    fetch("/api/players?limit=250", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then(setPlayers)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const candidates = useMemo(() => {
    if (!query.trim() || selected) return [];
    return searchPlayers(players, query, 8);
  }, [players, query, selected]);

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法开始对局。");
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交失败。");
    } finally {
      setBusy(false);
    }
  }

  async function abandon() {
    if (!attempt || !confirm("确定要放弃本局吗？")) return;
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
    } else setError(data.error ?? "放弃失败。");
  }

  return (
    <main className="game-shell solo-page">
      <header className="game-header solo-nav">
        <div className="solo-nav-left">
          <a href="/">康一把</a>
          <span className="solo-nav-mode">SOLO ALPHA</span>
        </div>
        <div className="solo-nav-right">
          {attempt && (
            <>
              <span className="solo-nav-difficulty">
                {difficultyLabels[attempt.difficulty]}
              </span>
              <strong className="solo-nav-count">
                {attempt.guessCount} / 8 次猜测
              </strong>
              {attempt.status === "active" && (
                <button className="text-button" onClick={abandon}>
                  放弃
                </button>
              )}
            </>
          )}
          {displayName ? (
            <a href="/account">{displayName}</a>
          ) : (
            <a href="/login">登录或注册</a>
          )}
        </div>
      </header>
      {!attempt && (
        <>
          <section className="game-intro">
            <p className="eyebrow">SOLO ALPHA</p>
            <h1>单人对战</h1>
            <p>根据职业选手资料缩小范围。每局最多 8 次猜测。</p>
          </section>
          <section className="difficulty-grid">
            {(["beginner", "easy", "full"] as Difficulty[]).map(
              (difficulty) => (
                <button
                  key={difficulty}
                  disabled={busy}
                  onClick={() => start(difficulty)}
                >
                  <strong>{difficultyLabels[difficulty]}</strong>
                  <span>开始随机对局</span>
                </button>
              ),
            )}
          </section>
        </>
      )}
      {attempt && (
        <section className="game-board">
          <div className="guess-table-wrap" aria-label="猜测信息表">
            <div className="guess-table guess-table-header">
              <span>猜测</span>
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
                      title={label}
                      aria-label={`${label}: ${valueFor(key, guess)}`}
                    >
                      {valueFor(key, guess)} {matchSymbol(tone)}
                    </span>
                  );
                })}
              </div>
            ))}
            {guesses.length === 0 && (
              <p className="guess-table-empty">
                完成一次猜测后，信息会显示在这里。
              </p>
            )}
          </div>
          {result && (
            <section className="result-panel">
              <p>
                {attempt.status === "won"
                  ? "猜中了"
                  : attempt.status === "abandoned"
                    ? "本局已放弃"
                    : "本局结束"}
              </p>
              <h2>答案：{result.target.canonicalName}</h2>
              <strong>{result.score} 分</strong>
              <button
                onClick={() => {
                  setAttempt(null);
                  setGuesses([]);
                  setResult(null);
                }}
              >
                再来一局
              </button>
            </section>
          )}
          {attempt.status === "active" && (
            <div className="guess-box guess-composer">
              <label>
                搜索选手
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelected(null);
                  }}
                  placeholder="输入选手 ID 或姓名"
                />
              </label>
              {query && !selected && (
                <div className="candidate-list">
                  {candidates.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => {
                        setSelected(player);
                        setQuery(player.canonicalName);
                      }}
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
                  猜测 {selected.canonicalName}
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