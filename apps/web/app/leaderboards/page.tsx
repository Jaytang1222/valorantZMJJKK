import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, detectLocale, t } from "../lib/i18n";

export default async function LeaderboardsPage() {
  const cookieStore = await cookies();
  const acceptLanguage = (await headers()).get("accept-language");
  const locale = detectLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage,
  );
  return (
    <main className="leaderboard-page">
      <a href="/" className="back-link">
        {t(locale, "lb.back")}
      </a>
      <header className="leaderboard-header">
        <div>
          <p className="eyebrow">VERSUS RANKING</p>
          <h1>{t(locale, "lb.title")}</h1>
        </div>
      </header>
      <section className="leaderboard-notice" aria-label={t(locale, "lb.title")}>
        <h2>{t(locale, "lb.comingSoon")}</h2>
        <p>{t(locale, "lb.notice")}</p>
      </section>
    </main>
  );
}