"use client";

import { useEffect, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import { createPortal } from "react-dom";
import { t } from "../lib/i18n";
import { useLocale } from "./ui-provider";

export function RulesDialog() {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        className="rules-trigger"
        type="button"
        onClick={() => setOpen(true)}
      >
        <CircleHelp aria-hidden="true" size={16} />
        {t(locale, "home.rulesButton")}
      </button>
      {mounted &&
        open &&
        createPortal(
          <div
            className="rules-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <section
              className="rules-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="rules-dialog-title"
              aria-describedby="rules-dialog-description"
            >
              <header className="rules-dialog-header">
                <div>
                  <p className="eyebrow">SYSTEM // RULESET</p>
                  <h2 id="rules-dialog-title">
                    {t(locale, "home.rulesTitle")}
                  </h2>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="icon-button"
                  aria-label={t(locale, "home.rulesClose")}
                  onClick={close}
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </header>
              <div className="rules-dialog-body">
                <p id="rules-dialog-description">
                  {t(locale, "home.rulesIntro")}
                </p>
                <div className="rules-cards">
                  <article className="rules-card" data-tone="exact">
                    <i aria-hidden="true" />
                    <h3>{t(locale, "legend.exact")}</h3>
                    <p>{t(locale, "home.rulesExact")}</p>
                  </article>
                  <article className="rules-card" data-tone="nearby">
                    <i aria-hidden="true" />
                    <h3>{t(locale, "legend.nearby")}</h3>
                    <p>{t(locale, "home.rulesNearby")}</p>
                  </article>
                  <article className="rules-card" data-tone="mismatch">
                    <i aria-hidden="true" />
                    <h3>{t(locale, "legend.mismatch")}</h3>
                    <p>{t(locale, "home.rulesMismatch")}</p>
                  </article>
                  <article className="rules-card" data-tone="direction">
                    <i aria-hidden="true">↑</i>
                    <h3>{t(locale, "legend.direction")}</h3>
                    <p>{t(locale, "home.rulesDirection")}</p>
                  </article>
                </div>
                <div className="rules-dialog-section">
                  <h3>{t(locale, "home.rulesEntry")}</h3>
                  <ul>
                    <li>{t(locale, "home.rulesSolo")}</li>
                    <li>{t(locale, "home.rulesGuesses")}</li>
                    <li>{t(locale, "home.rulesVersus")}</li>
                    <li>{t(locale, "home.rulesRecovery")}</li>
                    <li>{t(locale, "home.rulesScore")}</li>
                    <li>{t(locale, "home.rulesAccount")}</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
