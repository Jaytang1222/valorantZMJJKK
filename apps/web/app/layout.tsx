import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { CircleUserRound, Trophy } from "lucide-react";
import "./styles.css";
import {
  detectLocale,
  LOCALE_COOKIE,
  t,
} from "./lib/i18n";
import {
  NavControls,
  THEME_COOKIE,
  UiProvider,
  type Theme,
} from "./components/ui-provider";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const acceptLanguage = (await headers()).get("accept-language");
  const locale = detectLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage,
  );
  return {
    title: `${t(locale, "nav.brand")} — Guess the Valorant Pro`,
    description: t(locale, "home.lead"),
  };
}

const themeScript = `(function(){try{var t=localStorage.getItem('valo_theme');if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=(t==='light'?'light':'dark');document.documentElement.style.background=(t==='light'?'#f3f0ea':'#0f1923');}catch(_){document.documentElement.dataset.theme='dark';}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const acceptLanguage = (await headers()).get("accept-language");
  const locale = detectLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage,
  );
  const storedTheme = cookieStore.get(THEME_COOKIE)?.value;
  const theme: Theme = storedTheme === "light" ? "light" : "dark";

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} data-theme={theme}>
      <head>
        <meta name="theme-color" content={theme === "light" ? "#f3f0ea" : "#0f1923"} />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <UiProvider initialLocale={locale} initialTheme={theme}>
          <nav className="site-nav" aria-label={locale === "zh" ? "主导航" : "Main navigation"}>
            <div className="site-nav-inner">
              <a className="site-brand" href="/">
                <span className="brand-mark" aria-hidden="true">
                  V
                </span>
                <span>{t(locale, "nav.brand")}</span>
              </a>
              <div className="site-nav-tools">
                <a
                  href="/leaderboards"
                  aria-label={t(locale, "nav.leaderboards")}
                  title={t(locale, "nav.leaderboards")}
                >
                  <Trophy aria-hidden="true" size={18} />
                </a>
                <a
                  href="/account"
                  aria-label={t(locale, "nav.account")}
                  title={t(locale, "nav.account")}
                >
                  <CircleUserRound aria-hidden="true" size={19} />
                </a>
                <NavControls />
              </div>
            </div>
          </nav>
          {children}
          <footer className="site-footer">
            <a href="/privacy">{t(locale, "footer.privacy")}</a>
            <a href="/terms">{t(locale, "footer.terms")}</a>
            <a href="/data-sources">{t(locale, "footer.dataSources")}</a>
            <a href="/corrections">{t(locale, "footer.corrections")}</a>
          </footer>
        </UiProvider>
      </body>
    </html>
  );
}