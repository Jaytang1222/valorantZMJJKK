"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type RankingSummary = {
  rank: number;
  gamesPlayed: number;
  wins: number;
  averageGuesses: number;
  winRate: number;
};

type RecentGame = {
  id: string;
  mode: "solo" | "versus";
  result: "won" | "lost" | "abandoned";
  guessCount: number;
  score: number | null;
  finishedAt: string;
  targetName: string;
};

export default function AccountPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [solo, setSolo] = useState<RankingSummary | null>(null);
  const [versus, setVersus] = useState<RankingSummary | null>(null);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => {
        if (!data.user) router.replace("/login");
        else {
          setDisplayName(data.user.displayName);
          setEmail(data.user.email);
        }
      });
    fetch("/api/account/summary")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return;
        setSolo(data.solo);
        setVersus(data.versus);
        setRecentGames(data.recentGames ?? []);
      });
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="account-panel">
        <a href="/" className="back-link">
          返回首页
        </a>
        <h1>账户</h1>
        <p>{displayName}</p>
        <p>{email}</p>
        <a className="text-link" href="/leaderboards">
          查看总排行榜
        </a>
        <div className="account-stats" aria-label="对局统计">
          <StatsCard title="单人" value={solo} />
          <StatsCard title="联机" value={versus} />
        </div>
        <section className="recent-games" aria-label="最近三局">
          <h2>最近三局</h2>
          {recentGames.length === 0 ? (
            <p>暂无已完成对局。</p>
          ) : (
            recentGames.map((game) => (
              <div key={`${game.mode}-${game.id}`} className="recent-game">
                <strong>{game.mode === "solo" ? "单人" : "联机"}</strong>
                <span>
                  {game.result === "won"
                    ? "胜利"
                    : game.result === "lost"
                      ? "失败"
                      : "放弃"}
                </span>
                <span>{game.targetName}</span>
                <span>{game.guessCount} 次猜测</span>
                <time>{new Date(game.finishedAt).toLocaleString("zh-CN")}</time>
              </div>
            ))
          )}
        </section>
        <button className="text-button" onClick={logout}>
          退出登录
        </button>
      </section>
    </main>
  );
}

function StatsCard({
  title,
  value,
}: {
  title: string;
  value: RankingSummary | null;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {value ? (
        <dl>
          <div>
            <dt>局数</dt>
            <dd>{value.gamesPlayed}</dd>
          </div>
          <div>
            <dt>胜率</dt>
            <dd>{Math.round(value.winRate * 100)}%</dd>
          </div>
          <div>
            <dt>平均猜测</dt>
            <dd>{value.averageGuesses}</dd>
          </div>
        </dl>
      ) : (
        <p>暂无已结算对局。</p>
      )}
    </section>
  );
}
