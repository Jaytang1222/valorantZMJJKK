import { cookies, headers } from "next/headers";
import { Crosshair, GitFork, Swords, UsersRound } from "lucide-react";
import { LOCALE_COOKIE, detectLocale, t } from "./lib/i18n";

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
  const cookieStore = await cookies();
  const acceptLanguage = (await headers()).get("accept-language");
  const locale = detectLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage,
  );
  const apiStatus = await getApiStatus();

  return (
    <main className="home-page">
      <section className="hero">
        <div className="hero-reticle" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow">VALORANT // PLAYER INTEL</p>
          <h1>{t(locale, "nav.brand")}</h1>
          <p className="lead">{t(locale, "home.lead")}</p>
          <div className="status" data-online={apiStatus === "online"}>
            <span aria-hidden="true" />
            {apiStatus === "online"
              ? t(locale, "home.statusOnline")
              : t(locale, "home.statusOffline")}
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
      <section className="entries" aria-label="Game entries">
        <a className="entry-card solo-entry" href="/solo">
          <span className="entry-icon">
            <Crosshair aria-hidden="true" size={28} />
          </span>
          <span className="entry-kicker">SOLO</span>
          <strong>{t(locale, "home.entrySolo")}</strong>
          <small>{t(locale, "home.entrySoloDesc")}</small>
          <span className="entry-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
        <a className="entry-card versus-entry-card" href="/versus">
          <span className="entry-icon">
            <Swords aria-hidden="true" size={28} />
          </span>
          <span className="entry-kicker">VERSUS</span>
          <strong>{t(locale, "home.entryVersus")}</strong>
          <small>{t(locale, "home.entryVersusDesc")}</small>
          <span className="entry-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
        <a className="entry-card directory-entry" href="/players">
          <span className="entry-icon">
            <UsersRound aria-hidden="true" size={28} />
          </span>
          <span className="entry-kicker">DIRECTORY</span>
          <strong>{t(locale, "home.entryDirectory")}</strong>
          <small>{t(locale, "home.entryDirectoryDesc")}</small>
          <span className="entry-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
      </section>
      <a
        className="home-github"
        href="https://github.com/Jaytang1222/valorantZMJJKK"
        target="_blank"
        rel="noreferrer"
      >
        <GitFork aria-hidden="true" size={19} />
        <span>{t(locale, "home.githubCta")}</span>
      </a>
    </main>
  );
}
