"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";

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
type Player = { id: string; canonicalName: string; currentOrLastTeam: string };
type GuessResult = {
  canonicalName: string;
  isCorrect: boolean;
  comparison: Record<string, string>;
  points: number;
};

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3001";
const fields: Record<string, string> = {
  region: "赛区",
  country: "国籍",
  primaryRole: "位置",
  currentOrLastTeam: "队伍",
  championsTitles: "冠军赛冠军",
  mastersTitles: "大师赛冠军",
  heroTop3: "英雄 Top 3",
};

function matchLabel(tone: string) {
  if (tone === "exact" || tone === "equal") return "匹配";
  if (tone === "nearby" || tone === "partial") return "接近";
  if (tone === "higher") return "更高";
  if (tone === "lower") return "更低";
  return "不匹配";
}

async function getRealtimeTicket() {
  const response = await fetch("/api/auth/realtime-ticket", { method: "POST" });
  const data = await response.json();
  if (!response.ok || !data.ticket?.token)
    throw new Error(data.error ?? "无法获取实时连接凭据。");
  return data.ticket.token as string;
}

export default function MatchPage() {
  return (
    <Suspense
      fallback={
        <main className="game-shell">
          <p>正在载入对局。</p>
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
  const requestedCode = searchParams.get("code")?.toUpperCase() ?? "";
  const socketRef = useRef<Socket | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [ownGuesses, setOwnGuesses] = useState<GuessResult[]>([]);
  const [answer, setAnswer] = useState("");
  const [now, setNow] = useState(Date.now());
  const [closed, setClosed] = useState(false);
  const previousRoundRef = useRef<number | null>(null);

  useEffect(() => {
    if (!requestedCode) router.replace("/versus");
  }, [requestedCode, router]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setPlayers([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/players?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then(setPlayers)
        .catch(() => undefined);
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!requestedCode) return;
    let cancelled = false;
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then(async (data) => {
        if (!data.user) throw new Error("联机对战需要登录账户。");
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
                setError(reply?.error ?? "无法恢复该对局。");
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
          setError(`实时连接失败：${event.message}`);
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
        setError(cause instanceof Error ? cause.message : "无法建立实时连接。"),
      );
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [requestedCode]);

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
        resolve({ error: "实时连接尚未就绪，请稍后重试。" });
        return;
      }
      client
        .timeout(8_000)
        .emit(event, payload, (requestError: Error | null, reply: unknown) =>
          resolve(
            requestError ? { error: "请求超时，请检查实时连接。" } : reply,
          ),
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
    if (!room || !window.confirm("确认投降并结束本局吗？")) return;
    await run("room:surrender", { code: room.code });
  };

  const currentMember = room?.members.find((member) => member.userId === me);
  const opponent =
    room?.members.find(
      (member) => member.userId !== me && member.status !== "left",
    ) ?? null;
  const candidates = useMemo(() => players.slice(0, 8), [players]);
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
    ? "对局不可用"
    : currentMember?.status === "forfeited"
      ? room.finishReason === "surrender"
        ? "你已投降"
        : "你已判负"
      : room.winnerId === me
        ? "你获胜"
        : room.winnerId
          ? "本局失败"
          : "本局结束";

  if (closed)
    return (
      <main className="game-shell">
        <section className="result-panel">
          <p>房间已关闭。</p>
          <button onClick={() => router.push("/versus")}>返回联机主页</button>
        </section>
      </main>
    );
  if (error && !room)
    return (
      <main className="game-shell">
        <section className="result-panel">
          <p className="form-error">{error}</p>
          <button onClick={() => router.push("/versus")}>返回联机主页</button>
        </section>
      </main>
    );

  return (
    <main className="match-shell">
      <header className="match-header">
        <button className="text-button header-link" onClick={leaveToMenu}>
          退出到联机主页
        </button>
        <span>{connected ? "已连接" : "正在重连"}</span>
      </header>
      {room && (
        <>
          <section className="match-meta">
            <strong>房间 {room.code}</strong>
            <span>
              BO1 ·{" "}
              {room.phase === "playing" ? `${roundSeconds} 秒` : "本局已结束"}
            </span>
          </section>
          {error && <p className="form-error">{error}</p>}
          <section className="match-columns">
            <section className="match-player-panel own-panel">
              <div className="match-player-heading">
                <div>
                  <p>你</p>
                  <h1>{currentMember?.displayName}</h1>
                </div>
                <strong>{currentMember?.score ?? 0} 分</strong>
              </div>
              {currentMember?.status === "disconnected" && (
                <p className="disconnect-warning">
                  你的连接已断开，请在 {remainingSeconds(currentMember)}{" "}
                  秒内恢复。
                </p>
              )}
              {room.phase === "playing" &&
                currentMember?.status === "connected" && (
                  <>
                    <div className="match-guess-control">
                      <span>已猜 {currentMember.guessCount} / 8 次</span>
                      <input
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="搜索选手"
                      />
                      {candidates.map((player) => (
                        <button
                          className="candidate"
                          key={player.id}
                          onClick={async () => {
                            const reply = await run("room:guess", {
                              code: room.code,
                              playerId: player.id,
                            });
                            if (reply) setQuery("");
                          }}
                        >
                          {player.canonicalName}
                          <small>{player.currentOrLastTeam}</small>
                        </button>
                      ))}
                    </div>
                    <button
                      className="surrender-button"
                      disabled={!connected}
                      onClick={surrender}
                    >
                      投降
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
                      {guess.isCorrect && <span>正确 +{guess.points}</span>}
                    </header>
                    <div className="comparison-grid">
                      {Object.entries(guess.comparison).map(([field, tone]) => (
                        <span key={field} data-match={tone}>
                          {fields[field]}：{matchLabel(tone)}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="match-player-panel opponent-panel">
              <div className="match-player-heading">
                <div>
                  <p>对手</p>
                  <h1>{opponent?.displayName ?? "等待对手"}</h1>
                </div>
                <strong>{opponent?.score ?? 0} 分</strong>
              </div>
              {opponent?.status === "disconnected" && (
                <p className="disconnect-warning">
                  对手断线，{remainingSeconds(opponent)} 秒内可重连。
                </p>
              )}
              {opponent?.status === "forfeited" && (
                <p className="disconnect-warning">
                  对手已
                  {room.finishReason === "surrender" ? "投降" : "超时判负"}。
                </p>
              )}
              <p className="opponent-progress-label">猜测进度</p>
              <div className="opponent-feedback">
                {opponent?.feedback.map((tones, index) => (
                  <div className="feedback-row" key={index}>
                    {tones.map((tone, toneIndex) => (
                      <span
                        key={toneIndex}
                        data-match={tone}
                        aria-label={`第 ${index + 1} 次猜测，第 ${toneIndex + 1} 项：${matchLabel(tone)}`}
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
              <h2>答案：{answer || room.answerName || "正在揭晓"}</h2>
              <strong>{currentMember?.score ?? 0} 分</strong>
              <p>
                {room.finishReason === "surrender"
                  ? "本局因投降结束。"
                  : room.finishReason === "disconnect"
                    ? "本局因断线超时结束。"
                    : "本局结束。"}
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
                    {currentMember?.rematchReady ? "等待对手确认" : "再来一局"}
                  </button>
                )}
                <button className="secondary-action" onClick={leaveToMenu}>
                  返回联机主页
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
