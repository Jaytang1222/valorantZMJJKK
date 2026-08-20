"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t, tWith } from "../lib/i18n";
import { useLocale } from "../components/ui-provider";

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
  const { locale } = useLocale();
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
          {t(locale, "lb.back")}
        </a>
        <h1>{t(locale, "account.title")}</h1>
        <p>{displayName}</p>
        <p>{email}</p>
        <a className="text-link" href="/leaderboards">
          {t(locale, "account.leaderboardSoon")}
        </a>
        <div className="account-stats" aria-label={t(locale, "account.statsLabel")}>
          <StatsCard
            title={t(locale, "account.solo")}
            value={solo}
            locale={locale}
          />
          <StatsCard
            title={t(locale, "account.versus")}
            value={versus}
            locale={locale}
          />
        </div>
        <section className="recent-games" aria-label={t(locale, "account.recent")}>
          <h2>{t(locale, "account.recent")}</h2>
          {recentGames.length === 0 ? (
            <p>{t(locale, "account.noGames")}</p>
          ) : (
            recentGames.map((game) => (
              <div key={`${game.mode}-${game.id}`} className="recent-game">
                <strong>
                  {game.mode === "solo"
                    ? t(locale, "account.solo")
                    : t(locale, "account.versus")}
                </strong>
                <span>
                  {game.result === "won"
                    ? t(locale, "account.won")
                    : game.result === "lost"
                      ? t(locale, "account.lost")
                      : t(locale, "account.abandoned")}
                </span>
                <span>{game.targetName}</span>
                <span>{tWith(locale, "account.guesses", { count: game.guessCount })}</span>
                <time>
                  {new Date(game.finishedAt).toLocaleString(
                    locale === "zh" ? "zh-CN" : "en-US",
                  )}
                </time>
              </div>
            ))
          )}
        </section>
        <button className="text-button" onClick={logout}>
          {t(locale, "account.logout")}
        </button>
      </section>
    </main>
  );
}

function StatsCard({
  title,
  value,
  locale,
}: {
  title: string;
  value: RankingSummary | null;
  locale: "zh" | "en";
}) {
  return (
    <section>
      <h2>{title}</h2>
      {value ? (
        <dl>
          <div>
            <dt>{t(locale, "account.rounds")}</dt>
            <dd>{value.gamesPlayed}</dd>
          </div>
          <div>
            <dt>{t(locale, "account.winRate")}</dt>
            <dd>{Math.round(value.winRate * 100)}%</dd>
          </div>
          <div>
            <dt>{t(locale, "account.avgGuesses")}</dt>
            <dd>{value.averageGuesses}</dd>
          </div>
        </dl>
      ) : (
        <p>{t(locale, "account.noGames")}</p>
      )}
    </section>
  );
}