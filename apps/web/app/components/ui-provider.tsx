"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { LOCALE_COOKIE, type Locale } from "../lib/i18n";

export type Theme = "dark" | "light";

export const THEME_COOKIE = "valo_theme";
export const THEME_STORAGE = "valo_theme";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);
const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === "light" ? "light" : "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta)
    meta.setAttribute("content", theme === "light" ? "#f3f0ea" : "#0f1923");
}

export function UiProvider({
  initialLocale,
  initialTheme,
  children,
}: {
  initialLocale: Locale;
  initialTheme: Theme;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState(initialLocale);
  const [theme, setThemeState] = useState(initialTheme);

  useEffect(() => {
    const domTheme = document.documentElement.dataset.theme;
    if (domTheme === "light" || domTheme === "dark") {
      setThemeState(domTheme);
      document.cookie = `${THEME_COOKIE}=${domTheme}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      try {
        localStorage.setItem(LOCALE_COOKIE, next);
      } catch (_) {
        /* ignore */
      }
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
      router.refresh();
    },
    [router],
  );

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE, next);
    } catch (_) {
      /* ignore */
    }
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <ThemeContext.Provider value={{ theme, setTheme }}>
        {children}
      </ThemeContext.Provider>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used within UiProvider");
  return value;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within UiProvider");
  return value;
}

export function NavControls() {
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  return (
    <div className="nav-controls">
      <button
        type="button"
        className="nav-icon-btn"
        aria-label={locale === "zh" ? "Switch to English" : "切换到中文"}
        title={locale === "zh" ? "English" : "中文"}
        onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
      >
        {locale === "zh" ? "EN" : "中"}
      </button>
      <button
        type="button"
        className="nav-icon-btn"
        aria-label={
          theme === "dark" ? "Switch to light mode" : "切换到深色模式"
        }
        title={theme === "dark" ? "Light mode" : "深色模式"}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  );
}
