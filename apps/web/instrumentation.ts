import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment:
        process.env.SENTRY_ENVIRONMENT ??
        process.env.VERCEL_ENV ??
        "development",
      tracesSampleRate: 0,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
