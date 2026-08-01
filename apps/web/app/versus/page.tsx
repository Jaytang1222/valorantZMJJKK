"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

type Member = { userId: string; displayName: string; status: "connected" | "disconnected" | "forfeited" | "left"; ready: boolean; score: number; guessCount: number; disconnectedAt?: number; rematchReady: boolean; feedback: string[][] };
type Room = { code: string; hostId: string; phase: "lobby" | "countdown" | "playing" | "finished" | "cancelled"; roundNumber: number; roundCount: number; roundEndsAt?: number; winnerId?: string; members: Member[] };
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3001";

async function getRealtimeTicket() {
  const response = await fetch("/api/auth/realtime-ticket", { method: "POST" });
  const data = await response.json();
  if (!response.ok || !data.ticket?.token) throw new Error(data.error ?? "无法获取实时连接凭据。");
  return data.ticket.token as string;
}

export default function VersusPage() {
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [recoverCode, setRecoverCode] = useState("");

  useEffect(() => {
    setRecoverCode(localStorage.getItem("valo_versus_room") ?? "");
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
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
          if (nextRoom.phase !== "cancelled") {
            localStorage.setItem("valo_versus_room", nextRoom.code);
            setRecoverCode(nextRoom.code);
          }
        });
        client.on("room:closed", () => {
          localStorage.removeItem("valo_versus_room");
          setRecoverCode("");
          setRoom(null);
          setError("房间已关闭。");
        });
        client.on("match:found", ({ room: matchedRoom }: { room: Room }) => {
          setWaiting(false);
          localStorage.setItem("valo_versus_room", matchedRoom.code);
          setRecoverCode(matchedRoom.code);
          setRoom(matchedRoom);
        });
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "无法建立实时连接。"));
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (room?.phase === "playing") router.replace(`/versus/match?code=${encodeURIComponent(room.code)}`);
  }, [room?.code, room?.phase, router]);

  const emit = (event: string, payload: object) => new Promise<any>((resolve) => {
    const client = socketRef.current;
    if (!client?.connected) {
      resolve({ error: "实时连接尚未就绪，请稍后重试。" });
      return;
    }
    client.timeout(8_000).emit(event, payload, (requestError: Error | null, reply: unknown) => resolve(requestError ? { error: "请求超时，请检查实时连接。" } : reply));
  });

  const run = async (event: string, payload: object) => {
    setError("");
    const reply = await emit(event, payload);
    if (reply?.error) {
      setError(reply.error);
      return null;
    }
    if (reply?.room) {
      setRoom(reply.room);
      localStorage.setItem("valo_versus_room", reply.room.code);
      setRecoverCode(reply.room.code);
    }
    return reply;
  };

  const create = () => run("room:create", { maxPlayers: 2, roundCount: 1, roundDurationSeconds: 60 });
  const join = () => run("room:join", { code: joinCode.trim().toUpperCase() });
  const match = async () => {
    const reply = await run("match:join", { maxPlayers: 2, roundCount: 1, roundDurationSeconds: 60 });
    if (reply?.waiting) setWaiting(true);
  };
  const cancelMatch = async () => {
    await run("match:cancel", { maxPlayers: 2, roundCount: 1, roundDurationSeconds: 60 });
    setWaiting(false);
  };
  const leaveLobby = async (destination?: string) => {
    if (room) await run("room:leave", { code: room.code });
    localStorage.removeItem("valo_versus_room");
    setRecoverCode("");
    setRoom(null);
    if (destination) router.push(destination);
  };
  const currentMember = room?.members.find((member) => member.userId === me);
  const remainingSeconds = (member: Member) => member.disconnectedAt === undefined ? 0 : Math.max(0, Math.ceil((member.disconnectedAt + 20_000 - now) / 1000));

  if (!me && error) return <main className="game-shell"><p className="form-error">{error}</p><a href="/login">前往登录</a></main>;

  return <main className="game-shell">
    <header className="game-header">
      <button className="text-button header-link" onClick={() => leaveLobby("/")}>VALO 一把</button>
      <a href="/solo">单人对战</a>
    </header>
    <section className="game-intro">
      <p className="eyebrow">VERSUS BETA</p>
      <h1>联机对战</h1>
      <p className={connected ? "success-message" : "form-error"}>{connected ? "实时连接已就绪" : "正在连接实时服务"}</p>
      {error && <p className="form-error">{error}</p>}
    </section>

    {!room && <section className="versus-entry">
      {recoverCode && <div className="recover-room-actions"><button className="secondary-action" onClick={() => router.push(`/versus/match?code=${encodeURIComponent(recoverCode)}`)}>恢复对局</button><button className="text-button" onClick={() => { localStorage.removeItem("valo_versus_room"); setRecoverCode(""); }}>放弃恢复</button></div>}
      {waiting ? <button onClick={cancelMatch}>取消匹配</button> : <button className="entry-button" disabled={!connected} onClick={match}>在线匹配</button>}
      <button className="entry-button" disabled={!connected} onClick={create}>创建私密房间</button>
      <div className="join-room-row">
        <input aria-label="房间邀请码" value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="输入 6 位邀请码" />
        <button disabled={!connected || joinCode.length !== 6} onClick={join}>加入房间</button>
      </div>
    </section>}

    {room?.phase === "lobby" && <section className="game-board">
      <div className="game-meta"><strong>房间 {room.code}</strong><span>BO1</span></div>
      <div className="member-list">
        {room.members.filter((member) => member.status !== "left").map((member) => <div key={member.userId}>
          <span><strong>{member.displayName}{member.userId === room.hostId ? "（房主）" : ""}</strong>{member.status === "disconnected" && <b className="disconnect-warning">断线，{remainingSeconds(member)} 秒内可重连</b>}{member.status === "forfeited" && <b className="disconnect-warning">已离开房间</b>}</span>
          <span>{member.ready ? "已准备" : "未准备"} · {member.score} 分</span>
        </div>)}
      </div>
      <div className="room-actions">
        <button disabled={!connected || currentMember?.status !== "connected"} onClick={() => run("room:ready", { code: room.code, ready: !currentMember?.ready })}>{currentMember?.ready ? "取消准备" : "准备"}</button>
        {room.hostId === me && <button disabled={!connected} onClick={() => run("room:start", { code: room.code })}>开始 BO1</button>}
        <button className="secondary-action" onClick={() => leaveLobby()}>退出房间</button>
      </div>
    </section>}
  </main>;
}
