"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "../lib/i18n";
import { useLocale } from "../components/ui-provider";

export default function LoginPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? t(locale, "login.fail"));
      return;
    }
    router.push("/account");
    router.refresh();
  }
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <a href="/" className="back-link">
          {t(locale, "lb.back")}
        </a>
        <h1>
          {mode === "login"
            ? t(locale, "login.submit")
            : t(locale, "login.registerSubmit")}
        </h1>
        <p>{t(locale, "login.registerNote")}</p>
        <form onSubmit={submit} className="auth-form">
          <label>
            {t(locale, "login.email")}
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            {t(locale, "login.password")}
            <input
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit">
            {mode === "login"
              ? t(locale, "login.submit")
              : t(locale, "login.createAccount")}
          </button>
        </form>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? t(locale, "login.noAccount")
            : t(locale, "login.haveAccount")}
        </button>
      </section>
    </main>
  );
}
