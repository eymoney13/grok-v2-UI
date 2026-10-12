"use client";

import Link from "next/link";
import { useState } from "react";
import { dailySummary } from "@/lib/dailySummary";
import { coastGroupId } from "@/lib/coastBoard";
import { indexWhy } from "@/lib/neptuneIndex";
import { copy, notTestedPhrase, staleCountyBanner, type Lang } from "@/lib/publicCopy";
import type { GlanceBeach, PublicBeach } from "@/lib/publicBeach";
import { PublicChrome, usePublicLanguage } from "./Language";
import { StatusChip } from "./StatusChip";
import { SwimAnswer } from "./SwimAnswer";
import styles from "./public.module.css";

function formatDay(iso: string, lang: Lang): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(lang === "es" ? "es-US" : "en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function BeachPublic({
  beach,
  nearby,
  predictionDate,
  readingsCurrent,
  advisory,
  staleCounties = [],
}: {
  beach: PublicBeach;
  nearby: GlanceBeach[];
  predictionDate: string;
  readingsCurrent: boolean;
  advisory: { label: string; href: string };
  staleCounties?: readonly string[];
}) {
  return (
    <PublicChrome>
      <Beach
        beach={beach}
        nearby={nearby}
        predictionDate={predictionDate}
        readingsCurrent={readingsCurrent}
        advisory={advisory}
        staleCounties={staleCounties}
      />
    </PublicChrome>
  );
}

function Beach({
  beach,
  nearby,
  predictionDate,
  readingsCurrent,
  advisory,
  staleCounties = [],
}: {
  beach: PublicBeach;
  nearby: GlanceBeach[];
  predictionDate: string;
  readingsCurrent: boolean;
  advisory: { label: string; href: string };
  staleCounties?: readonly string[];
}) {
  const { lang } = usePublicLanguage();
  const t = copy[lang];
  const summary = dailySummary(beach, lang);
  const [copied, setCopied] = useState(false);
  const date = predictionDate || "";
  const staleCountiesNote = staleCountyBanner(staleCounties, lang);

  async function copyLink() {
    const url = `${window.location.origin}/beach/${beach.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const group = coastGroupId(beach);
  const countyHref = group ? `/california?group=${encodeURIComponent(group)}` : "/california";
  const why = beach.neptuneDisplay ? indexWhy(beach.neptuneDisplay, lang) : summary.status;

  return (
    <>
      <nav className={styles.crumb} aria-label="Breadcrumb">
        <a href="/">{t.homeTitle}</a>
        <span aria-hidden="true">/</span>
        {beach.county && (
          <>
            <a href={countyHref}>{beach.county}</a>
            <span aria-hidden="true">/</span>
          </>
        )}
        <span>{beach.name}</span>
      </nav>
      <a className={styles.back} href={countyHref}>
        {t.back}
      </a>
      <h1>{beach.name}</h1>
      {beach.county && <p className={styles.meta}>{beach.county}{beach.code ? ` · ${beach.code}` : ""}</p>}
      {beach.tier === "limited_data" && <p className={styles.badge}>{t.limitedBadge}</p>}
      {staleCountiesNote && <p className={styles.stale} role="status">{staleCountiesNote}</p>}
      {date && !readingsCurrent && (
        <p className={styles.stale} role="status">
          {t.stale} {formatDay(date, lang)}
          {t.staleTail}
        </p>
      )}
      <SwimAnswer beach={beach} lang={lang} size="hero" />
      <section className={styles.section}>
        <h2>{t.why}</h2>
        <p>{why}</p>
        {summary.rainAdvisory && <p>{summary.rainAdvisory}</p>}
        {summary.limitedLab && <p>{summary.limitedLab}</p>}
        {summary.fallback && <p>{summary.fallback}</p>}
      </section>
      <section className={styles.section}>
        <h2>{t.lastTestedHeading}</h2>
        <p>{beach.neverTested ? notTestedPhrase(lang) : summary.lastTested ?? t.awaiting}</p>
        {summary.recentResult && <p>{summary.recentResult}</p>}
      </section>
      <section className={styles.experimental} aria-label={summary.outlookLabel}>
        <span className={styles.tag}>{summary.outlookLabel}</span>
        <p>{summary.outlook}</p>
      </section>
      {summary.rain && (
        <section className={styles.section}>
          <p>{summary.rain}</p>
        </section>
      )}
      <div className={styles.links}>
        <button className={styles.secondary} type="button" onClick={copyLink}>
          {copied ? t.copied : t.copyLink}
        </button>
        <Link className={styles.link} href={`/california/beach/${encodeURIComponent(beach.slug)}`}>
          {t.fullBoard}
        </Link>
        <a className={styles.link} href={advisory.href} target="_blank" rel="noopener noreferrer">
          {t.advisory}: {advisory.label}
        </a>
      </div>
      {nearby.length > 0 && (
        <section className={styles.section}>
          <h2>{t.nearby}</h2>
          <ul className={styles.list}>
            {nearby.map((item) => (
              <li key={item.slug}>
                <Link className={styles.card} href={`/beach/${item.slug}`} prefetch={false}>
                  <span className={styles.name}>{item.name}</span>
                  {item.county && <span className={styles.meta}>{item.county}</span>}
                  <StatusChip beach={item} lang={lang} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
