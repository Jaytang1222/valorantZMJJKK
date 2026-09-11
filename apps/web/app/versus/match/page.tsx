"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import {
  formatCountry,
  formatRegion,
  formatRole,
  formatTeam,
} from "../../lib/display";
import { searchPlayers } from "../../lib/player-search";
import { t, tWith } from "../../lib/i18n";
import { GUESS_FIELDS, matchSymbol, toneLabel } from "../../lib/guess-fields";
import { useLocale } from "../../components/ui-provider";

type Member = {
  userId: string;
  displayName: string;
  status: "connected" | "disconnected" | "forfeited" | "left";
  ready: boolean;
  score: number;
  guessCount: number;
  disconnectedAt?: number;
  rematchReady: boolean;
  feedback: string[][];
};
type Room = {
  code: string;
  hostId: string;
  phase: "lobby" | "countdown" | "playing" | "finished" | "cancelled";
  roundNumber: number;
  roundCount: number;
  roundEndsAt?: number;
  winnerId?: string;
  answerName?: string;
  finishReason?:
    | "correct"
    | "time_expired"
    | "guesses_exhausted"
    | "disconnect"
    | "surrender";
  members: Member[];
};
type Player = {
  id: string;
  canonicalName: string;
  currentOrLastTeam: string;
  aliases?: string[];
};
type GuessResult = {
  canonicalName: string;
  isCorrect: boolean;
  comparison: Record<string, string>;
  points: number;
  details?: {
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
};
type OpponentProfile = {
  displayName: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  averageGuesses: number;
};

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3001";

function guessValue(field: string, guess: GuessResult, locale: "zh" | "en") {
  const details = guess.details;
  if (!details) return "—";
  if (field === "region") return formatRegion(details.region);
  if (field === "country") return formatCountry(details.countryCode, locale);
  if (field === "age") return guess.comparison.age ? (details.age ?? "—") : "—";
  if (field === "status")
    return t(
      locale,
      details.isActiveRoster ? "status.active" : "status.retired",
    );
  if (field === "primaryRole") return formatRole(details.primaryRole, locale);
  if (field === "currentOrLastTeam")
    return formatTeam(details.currentOrLastTeam);
  if (field === "championsTitles") return details.championsTitles;
  if (field === "mastersTitles") return details.mastersTitles;
  if (field === "leagueTitles") return details.leagueTitles;
  return "—";
}

async function getRealtimeTicket() {
  const response = await fetch("/api/auth/realtime-ticket", { method: "POST" });
  const data = await response.json();
  if (!response.ok || !data.ticket?.token)
    throw new Error(data.error ?? "Could not get real-time credentials.");
  return data.ticket.token as string;
}

export default function MatchPage() {
  return (
    <Suspense
      fallback={
        <main className="game-shell">
          <p>Loading match…</p>
        </main>
      }
    >
      <MatchPageContent />
    </Suspense>
  );
}

function MatchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const requestedCode = searchParams.get("code")?.toUpperCase() ?? "";
  const socketRef = useRef<Socket | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showCandidates, setShowCandidates] = useState(true);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(-1);
  const [players, setPlayers] = useState<Player[]>([]);
  const [ownGuesses, setOwnGuesses] = useState<GuessResult[]>([]);
  const [answer, setAnswer] = useState("");
  const [now, setNow] = useState(Date.now());
  const [closed, setClosed] = useState(false);
  const [opponentProfile, setOpponentProfile] =
    useState<OpponentProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const previousRoundRef = useRef<number | null>(null);

  useEffect(() => {
    if (!requestedCode) router.replace("/versus");
  }, [requestedCode, router]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Keep versus search consistent with solo search and the full directory.
    fetch("/api/players?limit=5000", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then(setPlayers)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!requestedCode) return;
    let cancelled = false;
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then(async (data) => {
        if (!data.user) throw new Error(t(locale, "match.needAccount"));
        setMe(data.user.id);
        const ticket = await getRealtimeTicket();
        if (cancelled) return;
        const client = io(WS_URL, {
          auth: { ticket },
          transports: ["websocket", "polling"],
          upgrade: true,
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 500,
          reconnectionDelayMax: 4_000,
          randomizationFactor: 0.5,
          timeout: 15_000,
        });
        socketRef.current = client;
        client.on("connect", () => {
          setConnected(true);
          setError("");
          client.timeout(8_000).emit(
            "room:reconnect",
            { code: requestedCode },
            (
              requestError: Error | null,
              reply: {
                room?: Room;
                ownGuesses?: GuessResult[];
                error?: string;
              },
            ) => {
              if (requestError || reply?.error) {
                localStorage.removeItem("valo_versus_room");
                setError(reply?.error ?? t(locale, "match.roomUnavailable"));
                return;
              }
              if (reply.room) setRoom(reply.room);
              setOwnGuesses(reply.ownGuesses ?? []);
            },
          );
        });
        client.on("disconnect", () => setConnected(false));
        client.on("connect_error", async (event) => {
          setConnected(false);
          setError(
            tWith(locale, "match.connectError", { message: event.message }),
          );
          try {
            client.auth = { ticket: await getRealtimeTicket() };
          } catch {
            // The visible connection error is enough for the player to act on.
          }
        });
        client.on("room:state", (nextRoom: Room) => {
          setRoom(nextRoom);
          if (nextRoom.answerName) setAnswer(nextRoom.answerName);
          localStorage.setItem("valo_versus_room", nextRoom.code);
        });
        client.on("room:guess-result", (guess: GuessResult) =>
          setOwnGuesses((items) => [...items, guess]),
        );
        client.on(
          "room:round-result",
          ({ target }: { target: { canonicalName: string } }) =>
            setAnswer(target.canonicalName),
        );
        client.on("room:closed", () => {
          localStorage.removeItem("valo_versus_room");
          setClosed(true);
          setRoom(null);
        });
      })
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : t(locale, "match.reconnectError"),
        ),
      );
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [requestedCode, locale]);

  useEffect(() => {
    if (room?.roundNumber === undefined) return;
    if (
      previousRoundRef.current !== null &&
      previousRoundRef.current !== room.roundNumber
    ) {
      setOwnGuesses([]);
      setAnswer("");
    }
    previousRoundRef.current = room.roundNumber;
  }, [room?.roundNumber]);

  const emit = (event: string, payload: object) =>
    new Promise<any>((resolve) => {
      const client = socketRef.current;
      if (!client?.connected) {
        resolve({ error: t(locale, "match.notReady") });
        return;
      }
      client
        .timeout(8_000)
        .emit(event, payload, (requestError: Error | null, reply: unknown) =>
          resolve(requestError ? { error: t(locale, "match.timeout") } : reply),
        );
    });

  const run = async (event: string, payload: object) => {
    setError("");
    const reply = await emit(event, payload);
    if (reply?.error) {
      setError(reply.error);
      return null;
    }
    if (reply?.room) setRoom(reply.room);
    return reply;
  };

  const leaveToMenu = async () => {
    if (room) await run("room:leave", { code: room.code });
    localStorage.removeItem("valo_versus_room");
    router.push("/versus");
  };
  const surrender = async () => {
    if (!room || !window.confirm(t(locale, "match.confirmSurrender"))) return;
    await run("room:surrender", { code: room.code });
  };

  const currentMember = room?.members.find((member) => member.userId === me);
  const opponent =
    room?.members.find(
      (member) => member.userId !== me && member.status !== "left",
    ) ?? null;
  useEffect(() => {
    setOpponentProfile(null);
    setProfileError("");
  }, [opponent?.userId]);
  const loadOpponentProfile = async () => {
    if (!opponent) return;
    setProfileLoading(true);
    setProfileError("");
    try {
      const response = await fetch(`/api/profiles/${opponent.userId}/versus`);
      const data = (await response.json()) as OpponentProfile & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? t(locale, "match.viewHistory"));
      setOpponentProfile(data);
    } catch (cause) {
      setProfileError(
        cause instanceof Error ? cause.message : t(locale, "match.viewHistory"),
      );
    } finally {
      setProfileLoading(false);
    }
  };
  const candidates = useMemo(
    () => searchPlayers(players, query, 250),
    [players, query],
  );
  useEffect(() => {
    setActiveCandidateIndex(-1);
    setShowCandidates(true);
  }, [query]);
  const submitPlayerGuess = async (player: Player) => {
    if (!room) return;
    const reply = await run("room:guess", {
      code: room.code,
      playerId: player.id,
    });
    if (reply) {
      setQuery("");
      setActiveCandidateIndex(-1);
      setShowCandidates(true);
    }
  };
  const remainingSeconds = (member: Member) =>
    member.disconnectedAt === undefined
      ? 0
      : Math.max(0, Math.ceil((member.disconnectedAt + 20_000 - now) / 1000));
  const roundSeconds = room?.roundEndsAt
    ? Math.max(0, Math.ceil((room.roundEndsAt - now) / 1000))
    : 0;
  const canRematch =
    room?.members.filter((member) => member.status === "connected").length ===
    2;
  const resultTitle = !room
    ? t(locale, "match.roomUnavailable")
    : currentMember?.status === "forfeited"
      ? room.finishReason === "surrender"
        ? t(locale, "match.youSurrendered")
        : t(locale, "match.youForfeited")
      : room.winnerId === me
        ? t(locale, "match.youWin")
        : room.winnerId
          ? t(locale, "match.youLost")
          : t(locale, "match.roundOver");

  if (closed)
    return (
      <main className="game-shell">
        <section className="result-panel">
          <p>{t(locale, "match.roomClosed")}</p>
          <button onClick={() => router.push("/versus")}>
            {t(locale, "match.backToVersus")}
          </button>
        </section>
      </main>
    );
  if (error && !room)
    return (
      <main className="game-shell">
        <section className="result-panel">
          <p className="form-error">{error}</p>
          <button onClick={() => router.push("/versus")}>
            {t(locale, "match.backToVersus")}
          </button>
        </section>
      </main>
    );

  return (
    <main className="match-shell">
      <header className="match-header">
        <button className="text-button header-link" onClick={leaveToMenu}>
          {t(locale, "match.leave")}
        </button>
        <span>
          {connected
            ? t(locale, "match.connected")
            : t(locale, "match.reconnecting")}
        </span>
      </header>
      {room && (
        <>
          <section className="match-meta">
            <strong>
              {tWith(locale, "match.roomCode", { code: room.code })}
            </strong>
            <span>
              BO1 ·{" "}
              {room.phase === "playing"
                ? tWith(locale, "match.seconds", { seconds: roundSeconds })
                : t(locale, "match.roundOver")}
            </span>
          </section>
          <p className="data-disclaimer">{t(locale, "solo.dataNotice")}</p>
          <section
            className="match-field-guide"
            aria-label={t(locale, "match.fieldLegend")}
          >
            <p>{t(locale, "match.fieldLegend")}</p>
            <small>{t(locale, "match.numericHint")}</small>
            <div className="comparison-legend" aria-hidden="true">
              <span data-legend="exact">
                <i />
                {t(locale, "legend.exact")}
              </span>
              <span data-legend="nearby">
                <i />
                {t(locale, "legend.nearby")}
              </span>
              <span data-legend="mismatch">
                <i />
                {t(locale, "legend.mismatch")}
              </span>
              <span data-legend="direction">
                <i>↕</i>
                {t(locale, "legend.direction")}
              </span>
            </div>
            <div className="match-field-order">
              {GUESS_FIELDS.map(([field, label]) => (
                <span key={field}>{t(locale, label)}</span>
              ))}
            </div>
          </section>
          {error && <p className="form-error">{error}</p>}
          <section className="match-columns">
            <section className="match-player-panel own-panel">
              <div className="match-player-heading">
                <div>
                  <p>{t(locale, "match.you")}</p>
                  <h1>{currentMember?.displayName}</h1>
                </div>
                <strong>
                  {tWith(locale, "match.points", {
                    score: currentMember?.score ?? 0,
                  })}
                </strong>
              </div>
              {currentMember?.status === "disconnected" && (
                <p className="disconnect-warning">
                  {tWith(locale, "match.disconnected", {
                    seconds: remainingSeconds(currentMember),
                  })}
                </p>
              )}
              {room.phase === "playing" &&
                currentMember?.status === "connected" && (
                  <>
                    <div className="match-guess-control">
                      <span>
                        {tWith(locale, "match.guessCount", {
                          used: currentMember.guessCount,
                        })}
                      </span>
                      <input
                        autoFocus
                        role="combobox"
                        value={query}
                        aria-expanded={
                          showCandidates &&
                          query.trim().length > 0 &&
                          candidates.length > 0
                        }
                        aria-controls="versus-player-listbox"
                        aria-activedescendant={
                          activeCandidateIndex >= 0
                            ? `versus-player-option-${activeCandidateIndex}`
                            : undefined
                        }
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setShowCandidates(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setActiveCandidateIndex(-1);
                            setShowCandidates(false);
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
                            void submitPlayerGuess(
                              candidates[activeCandidateIndex],
                            );
                          }
                        }}
                        placeholder={t(locale, "match.searchPlaceholder")}
                      />
                      {showCandidates && query && candidates.length > 0 && (
                        <div
                          className="candidate-list"
                          id="versus-player-listbox"
                          role="listbox"
                        >
                          {candidates.map((player, index) => (
                            <button
                              className="candidate"
                              key={player.id}
                              id={`versus-player-option-${index}`}
                              role="option"
                              aria-selected={activeCandidateIndex === index}
                              data-active={activeCandidateIndex === index}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => void submitPlayerGuess(player)}
                            >
                              {player.canonicalName}
                              <small>{player.currentOrLastTeam}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      className="surrender-button"
                      disabled={!connected}
                      onClick={surrender}
                    >
                      {t(locale, "match.surrender")}
                    </button>
                  </>
                )}
              <div className="private-guess-list">
                {ownGuesses.map((guess, index) => (
                  <article key={`${guess.canonicalName}-${index}`}>
                    <header>
                      <strong>
                        {index + 1}. {guess.canonicalName}
                      </strong>
                    </header>
                    <div className="comparison-grid">
                      {GUESS_FIELDS.map(([field, label]) => {
                        const tone = guess.comparison[field];
                        const isLegacyAge = field === "age" && !tone;
                        if (!tone && !isLegacyAge) return null;
                        return (
                          <span
                            key={field}
                            data-match={tone}
                            data-tone={toneLabel(tone)}
                            data-unavailable={isLegacyAge || undefined}
                          >
                            <b>{t(locale, label)}</b>
                            <strong>{guessValue(field, guess, locale)}</strong>
                            <i aria-hidden="true">{matchSymbol(tone ?? "")}</i>
                          </span>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="match-player-panel opponent-panel">
              <div className="match-player-heading">
                <div>
                  <p>{t(locale, "match.opponent")}</p>
                  <h1>
                    {opponent?.displayName ??
                      t(locale, "match.awaitingOpponent")}
                  </h1>
                  {opponent && (
                    <button
                      className="opponent-profile-toggle"
                      disabled={profileLoading}
                      onClick={() => {
                        if (opponentProfile) {
                          setOpponentProfile(null);
                          setProfileError("");
                          return;
                        }
                        void loadOpponentProfile();
                      }}
                    >
                      {profileLoading
                        ? t(locale, "match.profileLoading")
                        : opponentProfile
                          ? t(locale, "match.profileHide")
                          : t(locale, "match.profileShow")}
                    </button>
                  )}
                </div>
                <strong>
                  {tWith(locale, "match.points", {
                    score: opponent?.score ?? 0,
                  })}
                </strong>
              </div>
              {profileError && <p className="form-error">{profileError}</p>}
              {opponentProfile && (
                <section
                  className="opponent-profile-card"
                  aria-label={t(locale, "match.viewHistory")}
                >
                  <div>
                    <p>{t(locale, "match.profileGames")}</p>
                    <strong>{opponentProfile.gamesPlayed}</strong>
                  </div>
                  <div>
                    <p>{t(locale, "match.profileWins")}</p>
                    <strong>{opponentProfile.wins}</strong>
                  </div>
                  <div>
                    <p>{t(locale, "match.profileWinRate")}</p>
                    <strong>
                      {Math.round(opponentProfile.winRate * 100)}%
                    </strong>
                  </div>
                  <div>
                    <p>{t(locale, "match.profileAvgGuesses")}</p>
                    <strong>{opponentProfile.averageGuesses}</strong>
                  </div>
                </section>
              )}
              {opponent?.status === "disconnected" && (
                <p className="disconnect-warning">
                  {tWith(locale, "match.opponentDisconnected", {
                    seconds: remainingSeconds(opponent),
                  })}
                </p>
              )}
              {opponent?.status === "forfeited" && (
                <p className="disconnect-warning">
                  {room.finishReason === "surrender"
                    ? t(locale, "match.opponentSurrendered")
                    : t(locale, "match.opponentForfeited")}
                </p>
              )}
              <p className="opponent-progress-label">
                {t(locale, "match.progress")}
              </p>
              <div className="opponent-feedback">
                {opponent?.feedback.map((tones, index) => (
                  <div className="feedback-row" key={index}>
                    {tones.map((tone, toneIndex) => (
                      <span
                        key={toneIndex}
                        data-match={tone}
                        title={t(
                          locale,
                          GUESS_FIELDS[toneIndex]?.[1] ?? "col.guess",
                        )}
                        aria-label={tWith(locale, "match.guessPosition", {
                          n: index + 1,
                        })}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          </section>
          {room.phase === "finished" && (
            <section className="result-panel match-result">
              <p>{resultTitle}</p>
              <h2>
                {t(locale, "match.answer")}
                {answer || room.answerName || t(locale, "match.answerReveal")}
              </h2>
              <strong>
                {tWith(locale, "match.points", {
                  score: currentMember?.score ?? 0,
                })}
              </strong>
              <p>
                {room.finishReason === "surrender"
                  ? t(locale, "match.finishSurrender")
                  : room.finishReason === "disconnect"
                    ? t(locale, "match.finishDisconnect")
                    : t(locale, "match.finishRound")}
              </p>
              <div className="result-actions">
                {canRematch && (
                  <button
                    disabled={
                      !connected ||
                      currentMember?.rematchReady ||
                      currentMember?.status !== "connected"
                    }
                    onClick={() => run("room:rematch", { code: room.code })}
                  >
                    {currentMember?.rematchReady
                      ? t(locale, "match.waitingRematch")
                      : t(locale, "match.playAgain")}
                  </button>
                )}
                <button className="secondary-action" onClick={leaveToMenu}>
                  {t(locale, "match.backToVersus")}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
