"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type Member = { userId: string; displayName: string; status: string; ready: boolean; score: number; guessCount: number; disconnectedAt?: number; rematchReady: boolean; feedback: string[][] };
type Room = { code: string; hostId: string; phase: "lobby" | "countdown" | "playing" | "finished"; roundNumber: number; roundCount: number; roundEndsAt?: number; winnerId?: string; members: Member[] };
type Player = { id: string; canonicalName: string; currentOrLastTeam: string };
type GuessResult = { canonicalName: string; isCorrect: boolean; comparison: Record<string, string>; points: number };
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3001";
const fields: Record<string, string> = { region: "赛区", country: "国籍", primaryRole: "位置", currentOrLastTeam: "队伍", championsTitles: "冠军赛", mastersTitles: "大师赛", heroTop3: "英雄 Top 3" };

export default function VersusPage() {
  const socketRef = useRef<Socket | null>(null);
  const [room, setRoom] = useState<Room | null>(null); const [me, setMe] = useState<string | null>(null); const [connected, setConnected] = useState(false); const [error, setError] = useState(""); const [joinCode, setJoinCode] = useState(""); const [waiting, setWaiting] = useState(false); const [publicRooms, setPublicRooms] = useState<Room[]>([]); const [query, setQuery] = useState(""); const [players, setPlayers] = useState<Player[]>([]); const [ownGuesses, setOwnGuesses] = useState<GuessResult[]>([]); const [answer, setAnswer] = useState(""); const [now, setNow] = useState(Date.now());

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!query.trim()) { setPlayers([]); return; } const timer = window.setTimeout(() => fetch(`/api/players?q=${encodeURIComponent(query)}`).then((response) => response.json()).then(setPlayers), 180); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    let cancelled = false;
    const getTicket = async () => { const response = await fetch("/api/auth/realtime-ticket", { method: "POST" }); const data = await response.json(); if (!response.ok || !data.ticket?.token) throw new Error(data.error ?? "无法获取实时连接凭据"); return data.ticket.token as string; };
    const restore = (client: Socket) => { const code = localStorage.getItem("valo_versus_room"); if (code) client.timeout(8_000).emit("room:reconnect", { code }, (requestError: Error | null, reply: { room?: Room; error?: string }) => { if (requestError || reply?.error) { localStorage.removeItem("valo_versus_room"); setRoom(null); if (reply?.error && reply.error !== "Room not found") setError(reply.error); } else if (reply.room) setRoom(reply.room); }); };
    fetch("/api/auth/me").then((response) => response.json()).then(async (data) => { if (!data.user) throw new Error("联机对战需要登录账号"); setMe(data.user.id); const ticket = await getTicket(); if (cancelled) return; const client = io(WS_URL, { auth: { ticket }, transports: ["websocket", "polling"], upgrade: true, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 500, reconnectionDelayMax: 4_000, randomizationFactor: 0.5, timeout: 15_000 }); socketRef.current = client;
      client.on("connect", () => { setConnected(true); setError(""); client.emit("room:list-public", {}, (reply: { rooms?: Room[] }) => setPublicRooms(reply.rooms ?? [])); restore(client); });
      client.on("disconnect", () => setConnected(false));
      client.on("connect_error", async (event) => { setConnected(false); setError(`实时连接失败：${event.message}`); try { client.auth = { ticket: await getTicket() }; } catch { /* The visible error already explains the failure. */ } });
      client.on("room:state", (nextRoom: Room) => { localStorage.setItem("valo_versus_room", nextRoom.code); setRoom(nextRoom); });
      client.on("match:found", ({ room: matchedRoom }: { room: Room }) => { setWaiting(false); localStorage.setItem("valo_versus_room", matchedRoom.code); setRoom(matchedRoom); });
      client.on("room:guess-result", (guess: GuessResult) => setOwnGuesses((items) => [...items, guess]));
      client.on("room:round-result", ({ target }: { target: { canonicalName: string } }) => setAnswer(target.canonicalName));
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "无法建立实时连接"));
    return () => { cancelled = true; socketRef.current?.disconnect(); };
  }, []);

  useEffect(() => { setOwnGuesses([]); setAnswer(""); }, [room?.roundNumber]);
  const emit = (event: string, payload: object) => new Promise<any>((resolve) => { const client = socketRef.current; if (!client?.connected) return resolve({ error: "实时连接尚未就绪，请稍后重试" }); client.timeout(8_000).emit(event, payload, (requestError: Error | null, reply: unknown) => resolve(requestError ? { error: "请求超时，请检查实时连接" } : reply)); });
  const run = async (event: string, payload: object) => { setError(""); const reply = await emit(event, payload); if (reply?.error) { setError(reply.error); return null; } if (reply?.room) setRoom(reply.room); return reply; };
  const create = (isPublic: boolean) => run("room:create", { isPublic, maxPlayers: 2, roundCount: 1, roundDurationSeconds: 60 });
  const join = () => run("room:join", { code: joinCode.trim().toUpperCase() });
  const match = async () => { const reply = await run("match:join", { maxPlayers: 2, roundCount: 1, roundDurationSeconds: 60 }); if (reply?.waiting) setWaiting(true); };
  const cancelMatch = async () => { await run("match:cancel", { maxPlayers: 2, roundCount: 1, roundDurationSeconds: 60 }); setWaiting(false); };
  const currentMember = room?.members.find((member) => member.userId === me); const candidates = useMemo(() => players.slice(0, 8), [players]);
  const remainingSeconds = (member: Member) => member.disconnectedAt === undefined ? 0 : Math.max(0, Math.ceil((member.disconnectedAt + 20_000 - now) / 1000));

  if (!me && error) return <main className="game-shell"><p className="form-error">{error}</p><a href="/login">前往登录</a></main>;
  return <main className="game-shell"><header className="game-header"><a href="/">VALO 一把</a><a href="/solo">单人对战</a></header><section className="game-intro"><p className="eyebrow">VERSUS BETA</p><h1>联机对战</h1><p className={connected ? "success-message" : "form-error"}>{connected ? "实时连接已就绪" : "正在重新连接实时服务"}</p>{error && <p className="form-error">{error}</p>}</section>
    {!room && <section className="versus-entry">{waiting ? <button onClick={cancelMatch}>取消匹配</button> : <button className="entry-button" disabled={!connected} onClick={match}>在线匹配</button>}<button className="entry-button" disabled={!connected} onClick={() => create(false)}>创建私密房间</button><button className="entry-button" disabled={!connected} onClick={() => create(true)}>创建公开房间</button><div className="join-room-row"><input aria-label="房间邀请码" value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="输入 6 位邀请码" /><button disabled={!connected || joinCode.length !== 6} onClick={join}>加入房间</button></div>{publicRooms.map((item) => <button key={item.code} onClick={() => run("room:join", { code: item.code })}>公开房 {item.code} · {item.members.length} 人</button>)}</section>}
    {room && <section className="game-board"><div className="game-meta"><strong>房间 {room.code}</strong><span>BO1 · 第 {room.roundNumber || 1} 局</span></div><div className="member-list">{room.members.map((member) => <div key={member.userId}><span><strong>{member.displayName}{member.userId === room.hostId ? "（房主）" : ""}</strong>{member.status === "disconnected" && <b className="disconnect-warning">断线，{remainingSeconds(member)} 秒内可重连</b>}{member.status === "forfeited" && <b className="disconnect-warning">已超时判负</b>}</span><span>{member.ready ? "已准备" : "未准备"} · {member.score} 分</span></div>)}</div>
      {room.phase === "lobby" && <div className="room-actions"><button disabled={!connected} onClick={() => run("room:ready", { code: room.code, ready: !currentMember?.ready })}>切换准备</button>{room.hostId === me && <button disabled={!connected} onClick={() => run("room:start", { code: room.code })}>开始 BO1</button>}</div>}
      {room.phase === "playing" && <><div className="guess-box"><p>已猜 {currentMember?.guessCount ?? 0} / 8 次</p><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索选手" />{candidates.map((player) => <button className="candidate" key={player.id} onClick={async () => { const reply = await run("room:guess", { code: room.code, playerId: player.id }); if (reply) setQuery(""); }}>{player.canonicalName} <small>{player.currentOrLastTeam}</small></button>)}</div><div className="versus-progress">{room.members.map((member) => <section key={member.userId}><h2>{member.userId === me ? "我的提示" : `${member.displayName} 的进度`}</h2>{member.feedback.map((tones, index) => <div className="feedback-row" key={index}>{tones.map((tone, toneIndex) => <span key={toneIndex} data-match={tone}>{member.userId === me ? Object.values(fields)[toneIndex] : ""}</span>)}</div>)}</section>)}</div></>}
      {ownGuesses.length > 0 && <div className="guess-history">{ownGuesses.map((guess, index) => <article key={index}><h2>{index + 1}. {guess.canonicalName}</h2><div className="comparison-grid">{Object.entries(guess.comparison).map(([field, tone]) => <span data-match={tone} key={field}>{fields[field]}：{tone === "exact" || tone === "equal" ? "匹配" : tone === "nearby" || tone === "partial" ? "接近" : tone === "higher" ? "更高" : tone === "lower" ? "更低" : "不匹配"}</span>)}</div></article>)}</div>}
      {room.phase === "finished" && <section className="result-panel"><p>{room.winnerId ? `胜者：${room.members.find((member) => member.userId === room.winnerId)?.displayName}` : "本局结束"}</p>{answer && <h2>答案：{answer}</h2>}{[...room.members].sort((a, b) => b.score - a.score).map((member) => <p key={member.userId}>{member.displayName} · 累计 {member.score} 分 {member.rematchReady ? "· 已选择再来一局" : ""}</p>)}<button disabled={!connected || currentMember?.rematchReady} onClick={() => run("room:rematch", { code: room.code })}>{currentMember?.rematchReady ? "等待对方确认" : "再来一局"}</button></section>}
    </section>}
  </main>;
}
