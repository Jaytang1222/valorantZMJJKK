"use client";

import { useEffect, useState } from "react";

type Mode = "solo" | "versus";
type Entry = {
  userId: string;
  displayName: string;
  rank: number;
  totalScore: number;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  averageGuesses: number;
};

type LeaderboardResponse = {
  entries: Entry[];
  nextCursor: string | null;
  currentUser: { entry: Entry; neighbors: Entry[] } | null;
};

export default function LeaderboardsPage() {
  const [mode, setMode] = useState<Mode>("solo");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [currentUser, setCurrentUser] =
    useState<LeaderboardResponse["currentUser"]>(null);
  const [loading, setLoading] = useState(true);

  async function load(cursor?: string, append = false) {
    setLoading(true);
    const query = new URLSearchParams({ mode, limit: "20" });
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(`/api/leaderboards?${query}`);
    const data = (await response.json()) as LeaderboardResponse;
    setEntries((previous) =>
      append ? [...previous, ...data.entries] : data.entries,
    );
    setNextCursor(data.nextCursor);
    setCurrentUser(data.currentUser);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [mode]);

  return (
    <main className="leaderboard-page">
      <a href="/" className="back-link">
        返回首页
      </a>
      <header className="leaderboard-header">
        <div>
          <p className="eyebrow">TOTAL RANKING</p>
          <h1>排行榜</h1>
        </div>
        <div className="mode-tabs" role="tablist" aria-label="排行榜模式">
          <button
            role="tab"
            aria-selected={mode === "solo"}
            onClick={() => setMode("solo")}
          >
            单人
          </button>
          <button
            role="tab"
            aria-selected={mode === "versus"}
            onClick={() => setMode("versus")}
          >
            联机
          </button>
        </div>
      </header>
      {currentUser && (
        <section className="rank-summary" aria-label="我的排名">
          <span>我的排名</span>
          <strong>#{currentUser.entry.rank}</strong>
          <span>{currentUser.entry.totalScore} 分</span>
        </section>
      )}
      <section className="leaderboard-table" aria-busy={loading}>
        <div className="leaderboard-row leaderboard-labels">
          <span>排名</span>
          <span>玩家</span>
          <span>积分</span>
          <span>局数</span>
          <span>胜率</span>
        </div>
        {entries.length === 0 && !loading ? (
          <p>暂无可排名的已结算对局。</p>
        ) : (
          entries.map((entry) => (
            <div className="leaderboard-row" key={entry.userId}>
              <strong>#{entry.rank}</strong>
              <span>{entry.displayName}</span>
              <strong>{entry.totalScore}</strong>
              <span>{entry.gamesPlayed}</span>
              <span>{Math.round(entry.winRate * 100)}%</span>
            </div>
          ))
        )}
      </section>
      {nextCursor && (
        <button
          className="load-more"
          disabled={loading}
          onClick={() => void load(nextCursor, true)}
        >
          加载更多
        </button>
      )}
    </main>
  );
}
