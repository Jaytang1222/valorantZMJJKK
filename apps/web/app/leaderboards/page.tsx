export default function LeaderboardsPage() {
  return (
    <main className="leaderboard-page">
      <a href="/" className="back-link">
        返回首页
      </a>
      <header className="leaderboard-header">
        <div>
          <p className="eyebrow">VERSUS RANKING</p>
          <h1>联机排行榜</h1>
        </div>
      </header>
      <section className="leaderboard-notice" aria-label="联机排行榜状态">
        <h2>后续开放</h2>
        <p>联机排行榜正在完善对局质量与公平性规则，开放后将在此展示。</p>
      </section>
    </main>
  );
}
