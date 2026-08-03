const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001";

async function getApiStatus(): Promise<"online" | "offline"> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}

export default async function HomePage() {
  const apiStatus = await getApiStatus();

  return (
    <main className="home-page">
      <section className="hero">
        <div className="hero-reticle" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow">VALORANT // PLAYER INTEL</p>
          <h1>康一把</h1>
          <p className="lead">从职业选手的赛区、位置与战队履历中锁定答案。</p>
          <div className="status" data-online={apiStatus === "online"}>
            <span aria-hidden="true" />
            {apiStatus === "online" ? "服务在线" : "服务离线"}
          </div>
        </div>
        <div className="hero-readout" aria-hidden="true">
          <span>08</span>
          <i />
          <span>GUESSES</span>
          <i />
          <span>LIVE</span>
        </div>
      </section>
      <section className="entries" aria-label="游戏入口">
        <a className="entry-card solo-entry" href="/solo">
          <span className="entry-icon">
            <Crosshair aria-hidden="true" size={28} />
          </span>
          <span className="entry-kicker">SOLO</span>
          <strong>单人对战</strong>
          <small>三档题库 · 8 次机会</small>
          <span className="entry-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
        <a className="entry-card versus-entry-card" href="/versus">
          <span className="entry-icon">
            <Swords aria-hidden="true" size={28} />
          </span>
          <span className="entry-kicker">VERSUS</span>
          <strong>联机对战</strong>
          <small>匹配或 6 位邀请码</small>
          <span className="entry-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
        <a className="entry-card directory-entry" href="/players">
          <span className="entry-icon">
            <UsersRound aria-hidden="true" size={28} />
          </span>
          <span className="entry-kicker">DIRECTORY</span>
          <strong>查选手</strong>
          <small>浏览已审核公开资料</small>
          <span className="entry-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
      </section>
    </main>
  );
}
import { Crosshair, Swords, UsersRound } from "lucide-react";
