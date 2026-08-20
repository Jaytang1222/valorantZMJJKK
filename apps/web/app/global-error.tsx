"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import { readStoredLocale, t } from "./lib/i18n";

export default function GlobalError({
  error,
}: Readonly<{ error: Error & { digest?: string } }>) {
  const [locale] = useState<"zh" | "en">(
    () => readStoredLocale() ?? (navigator.language.startsWith("zh") ? "zh" : "en"),
  );
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body>
        <main>
          <h1>{t(locale, "error.pageUnavailable")}</h1>
          <p>{t(locale, "error.retry")}</p>
        </main>
      </body>
    </html>
  );
}