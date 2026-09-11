import { cookies, headers } from "next/headers";
import { Crosshair, GitFork, Swords, UsersRound } from "lucide-react";
import { RulesDialog } from "./components/rules-dialog";
import { LOCALE_COOKIE, detectLocale, t } from "./lib/i18n";

export default async function HomePage() {
  const cookieStore = await cookies();
  const acceptLanguage = (await headers()).get("accept-language");
  const locale = detectLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage,
  );
  return (
    <main className="home-page">
      <section className="hero">
        <div className="hero-reticle" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow">VALORANT // PLAYER INTEL</p>
          <h1>{t(locale, "nav.brand")}</h1>
          <RulesDialog />
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
