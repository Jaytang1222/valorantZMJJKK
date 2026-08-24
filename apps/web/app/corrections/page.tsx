import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, detectLocale, t, tWith } from "../lib/i18n";

const EMAIL = "jaytang12221@outlook.com";

export async function generateMetadata() {
  const cookieStore = await cookies();
  const acceptLanguage = (await headers()).get("accept-language");
  const locale = detectLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage,
  );
  return {
    title: `${t(locale, "corrections.title")} | ${t(locale, "nav.brand")}`,
  };
}

export default async function CorrectionsPage() {
  const cookieStore = await cookies();
  const acceptLanguage = (await headers()).get("accept-language");
  const locale = detectLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage,
  );
  return (
    <main className="legal-page">
      <a href="/" className="back-link">
        {t(locale, "lb.back")}
      </a>
      <p className="eyebrow">CORRECTIONS</p>
      <h1>{t(locale, "corrections.title")}</h1>
      <p>{tWith(locale, "corrections.bodyText", { email: EMAIL })}</p>
      <p>{t(locale, "corrections.verifyText")}</p>
    </main>
  );
}
