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
  return { title: `${t(locale, "terms.title")} | ${t(locale, "nav.brand")}` };
}

export default async function TermsPage() {
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
      <p className="eyebrow">TERMS</p>
      <h1>{t(locale, "terms.title")}</h1>
      <p>{tWith(locale, "terms.updated", { brand: t(locale, "nav.brand") })}</p>
      <h2>{t(locale, "terms.nature")}</h2>
      <p>{t(locale, "terms.natureText")}</p>
      <h2>{t(locale, "terms.responsibility")}</h2>
      <p>{t(locale, "terms.responsibilityText")}</p>
      <h2>{t(locale, "terms.account")}</h2>
      <p>{t(locale, "terms.accountText")}</p>
      <h2>{t(locale, "terms.contact")}</h2>
      <p>
        {tWith(locale, "terms.contactText", { email: EMAIL })}
      </p>
    </main>
  );
}