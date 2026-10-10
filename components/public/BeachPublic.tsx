"use client";

import Link from "next/link";
import { useState } from "react";
import { dailySummary } from "@/lib/dailySummary";
import { copy, type Lang } from "@/lib/publicCopy";
import type { ConfidenceLevel } from "@/lib/publishedReading";
import type { GlanceBeach, PublicBeach } from "@/lib/publicBeach";
import { PublicChrome, usePublicLanguage } from "./Language";
import { StatusChip } from "./StatusChip";
import styles from "./public.module.css";

function confidenceClass(level: ConfidenceLevel): string {
  if (level === "low") return styles.confidenceLow;
  if (level === "medium") return styles.confidenceMedium;
  return styles.confidenceHigh;
}

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
}: {
  beach: PublicBeach;
  nearby: GlanceBeach[];
  predictionDate: string;
  readingsCurrent: boolean;
  advisory: { label: string; href: string };
}) {
  return (
    <PublicChrome>
      <Beach
        beach={beach}
        nearby={nearby}
        predictionDate={predictionDate}
        readingsCurrent={readingsCurrent}
        advisory={advisory}
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
}: {
  beach: PublicBeach;
  nearby: GlanceBeach[];
  predictionDate: string;
  readingsCurrent: boolean;
  advisory: { label: string; href: string };
}) {
  const { lang } = usePublicLanguage();
  const t = copy[lang];
  const summary = dailySummary(beach, lang);
  const [copied, setCopied] = useState(false);
  const date = predictionDate || "";

  async function copyLink() {
    const url = `${window.location.origin}/beach/${beach.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <p className={styles.meta}>{beach.county}</p>
      <h1>{beach.name}</h1>
      {date && !readingsCurrent && (
        <p className={styles.stale} role="status">
          {t.stale} {formatDay(date, lang)}
          {t.staleTail}
        </p>
      )}
      {date ? (
        <p className={styles.dateline}>
          {t.forecastDate} <time dateTime={date}>{formatDay(date, lang)}</time>
        </p>
      ) : (
        <p className={styles.dateline}>{t.awaiting}</p>
      )}
      <StatusChip beach={beach} lang={lang} />
      <div className={styles.summary}>
        <p>{summary.status}</p>
        {summary.method && <p className={styles.methodLine}>{summary.method}</p>}
        {summary.confidence && (
          <p className={confidenceClass(summary.confidence.level)}>{summary.confidence.text}</p>
        )}
        {summary.rainAdvisory && <p>{summary.rainAdvisory}</p>}
        {summary.lastTested && <p>{summary.lastTested}</p>}
        {summary.limitedLab && <p>{summary.limitedLab}</p>}
        {summary.tierNote && <p>{summary.tierNote}</p>}
        {summary.fallback && <p>{summary.fallback}</p>}
      </div>
      <section className={styles.experimental} aria-label={summary.outlookLabel}>
        <span className={styles.tag}>{summary.outlookLabel}</span>
        <p>{summary.outlook}</p>
      </section>
      {(summary.rain || summary.recentResult) && (
        <section className={styles.section}>
          {summary.rain && <p>{summary.rain}</p>}
          {summary.recentResult && <p>{summary.recentResult}</p>}
        </section>
      )}
      <div className={styles.links}>
        <button className={styles.secondary} type="button" onClick={copyLink}>
          {copied ? t.copied : t.copyLink}
        </button>
        <Link className={styles.link} href={`/california/beach/${encodeURIComponent(beach.code)}`}>
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
              <li key={item.code}>
                <Link className={styles.card} href={`/beach/${item.slug}`}>
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
