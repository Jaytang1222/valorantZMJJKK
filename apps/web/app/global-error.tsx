"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: Readonly<{ error: Error & { digest?: string } }>) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="zh-CN">
      <body>
        <main>
          <h1>页面暂时不可用</h1>
          <p>请稍后重试。</p>
        </main>
      </body>
    </html>
  );
}
