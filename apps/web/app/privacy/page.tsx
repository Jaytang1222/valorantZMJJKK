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
  return { title: `${t(locale, "privacy.title")} | ${t(locale, "nav.brand")}` };
}

export default async function PrivacyPage() {
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
      <p className="eyebrow">PRIVACY</p>
      <h1>{t(locale, "privacy.title")}</h1>
      <p>{tWith(locale, "privacy.updated", { brand: t(locale, "nav.brand") })}</p>
      <h2>{t(locale, "privacy.data")}</h2>
      <p>{t(locale, "privacy.dataText")}</p>
      <h2>{t(locale, "privacy.usage")}</h2>
      <p>{t(locale, "privacy.usageText")}</p>
      <h2>{t(locale, "privacy.deletion")}</h2>
      <p>
        {tWith(locale, "privacy.deletionText", { email: EMAIL })}
      </p>
      <h2>{t(locale, "privacy.scope")}</h2>
      <p>{t(locale, "privacy.scopeText")}</p>
    </main>
  );
}