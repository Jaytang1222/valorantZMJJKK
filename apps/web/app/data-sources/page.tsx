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
  return { title: `${t(locale, "dataSources.title")} | ${t(locale, "nav.brand")}` };
}

export default async function DataSourcesPage() {
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
      <p className="eyebrow">DATA & TRADEMARKS</p>
      <h1>{t(locale, "dataSources.title")}</h1>
      <p>{t(locale, "dataSources.collectedText")}</p>
      <p>{tWith(locale, "dataSources.riotText", { brand: t(locale, "nav.brand") })}</p>
      <p>{tWith(locale, "dataSources.contactText", { email: EMAIL })}</p>
    </main>
  );
}