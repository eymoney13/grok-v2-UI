"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { copy, type Lang } from "@/lib/publicCopy";
import styles from "./public.module.css";

const KEY = "neptune-public-lang";

const LanguageContext = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
}>({ lang: "en", setLang: () => {} });

export function usePublicLanguage() {
  return useContext(LanguageContext);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "es" || saved === "en") setLangState(saved);
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(KEY, next);
  };

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

export function PublicChrome({ children }: { children: ReactNode }) {
  const { lang, setLang } = usePublicLanguage();
  const t = copy[lang];
  return (
    <div className={styles.page} lang={lang}>
      <header className={styles.top}>
        <Link className={styles.brand} href="/">
          {t.brand}
        </Link>
        <div className={styles.langs} role="group" aria-label={t.language}>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>
            English
          </button>
          <button type="button" aria-pressed={lang === "es"} onClick={() => setLang("es")}>
            Español
          </button>
        </div>
      </header>
      {children}
      <p className={styles.honesty}>{t.honesty}</p>
      <footer className={styles.footer}>
        <Link href="/california">{t.footerBoard}</Link>
        <Link href="/california/how-it-works">{t.footerHow}</Link>
        <Link href="/california/neptune-index">{t.footerIndex}</Link>
      </footer>
    </div>
  );
}
