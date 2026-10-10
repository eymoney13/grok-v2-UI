"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { glanceLine } from "@/lib/dailySummary";
import { hasCoordinates, milesBetween, nearest } from "@/lib/geo";
import { copy, statusPill, type Lang } from "@/lib/publicCopy";
import type { GlanceBeach } from "@/lib/publicBeach";
import { PublicChrome, usePublicLanguage } from "./Language";
import { StatusChip } from "./StatusChip";
import styles from "./public.module.css";

const PublicMap = dynamic(() => import("./PublicMap"), {
  ssr: false,
  loading: () => <p className={styles.note}>…</p>,
});

const NEAR_COUNT = 8;
const SEARCH_COUNT = 20;
const FAR_MILES = 50;

function fold(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function formatMiles(miles: number): string {
  return miles < 10 ? (Math.round(miles * 10) / 10).toFixed(1) : String(Math.round(miles));
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

export default function NearMeHome({
  beaches,
  predictionDate,
  readingsCurrent,
}: {
  beaches: GlanceBeach[];
  predictionDate: string;
  readingsCurrent: boolean;
}) {
  return (
    <PublicChrome>
      <Home beaches={beaches} predictionDate={predictionDate} readingsCurrent={readingsCurrent} />
    </PublicChrome>
  );
}

function Home({
  beaches,
  predictionDate,
  readingsCurrent,
}: {
  beaches: GlanceBeach[];
  predictionDate: string;
  readingsCurrent: boolean;
}) {
  const { lang } = usePublicLanguage();
  const t = copy[lang];
  const [draft, setDraft] = useState("");
  const [geo, setGeo] = useState<"idle" | "locating" | "denied" | "ready">("idle");
  const [here, setHere] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    if (!navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (status.state === "granted") locate();
      })
      .catch(() => {});
    // locate is stable enough for a one-time granted check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function locate() {
    if (!navigator.geolocation) {
      setGeo("denied");
      return;
    }
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHere({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setGeo("ready");
      },
      () => setGeo("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 }
    );
  }

  const query = fold(draft);
  const mode = query ? "search" : here ? "near" : "prompt";

  const results = useMemo(() => {
    if (mode === "search") {
      const ranked = beaches
        .map((beach) => ({ beach, rank: searchRank(beach, query) }))
        .filter((item) => item.rank < 4)
        .sort((a, b) => a.rank - b.rank || a.beach.name.localeCompare(b.beach.name));
      return ranked.map((item) => item.beach);
    }
    if (mode === "near" && here) return nearest(here, beaches.filter(hasCoordinates), NEAR_COUNT);
    return [];
  }, [beaches, here, mode, query]);

  const visible = results.slice(0, mode === "search" ? SEARCH_COUNT : NEAR_COUNT);
  const closestMiles = here && visible[0] && hasCoordinates(visible[0]) ? milesBetween(here, visible[0]) : null;

  return (
    <>
      <h1>{t.homeTitle}</h1>
      <p className={styles.lead}>{t.homeLead}</p>
      {predictionDate && !readingsCurrent && (
        <p className={styles.stale} role="status">
          {t.stale} {formatDay(predictionDate, lang)}
          {t.staleTail}
        </p>
      )}
      {predictionDate ? (
        <p className={styles.dateline}>
          {t.forecastDate} <time dateTime={predictionDate}>{formatDay(predictionDate, lang)}</time>
        </p>
      ) : (
        <p className={styles.dateline}>{t.awaiting}</p>
      )}

      <div className={styles.actions}>
        <button className={styles.primary} type="button" onClick={locate}>
          {geo === "locating" ? t.locating : t.useLocation}
        </button>
        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            const field = event.currentTarget.elements.namedItem("q");
            if (field instanceof HTMLInputElement) field.blur();
          }}
        >
          <label htmlFor="beach-search">{t.searchLabel}</label>
          <div className={styles.searchRow}>
            <input
              id="beach-search"
              name="q"
              value={draft}
              autoComplete="off"
              enterKeyHint="search"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit">{t.search}</button>
          </div>
        </form>
      </div>

      {mode === "prompt" && <p className={styles.note}>{geo === "denied" ? t.locationDenied : t.empty}</p>}
      {mode === "search" && visible.length === 0 && <p className={styles.note}>{t.noMatches}</p>}

      {visible.length > 0 && (
        <section aria-live="polite">
          <h2>{mode === "near" ? t.closest : t.matches}</h2>
          {mode === "near" && closestMiles != null && closestMiles > FAR_MILES && (
            <p className={styles.note}>
              {t.far} {formatMiles(closestMiles)} {t.miles} {t.away}
            </p>
          )}
          <ul className={styles.list}>
            {visible.map((beach) => {
              const miles = here && hasCoordinates(beach) ? milesBetween(here, beach) : null;
              const tested = glanceLine(beach, lang);
              return (
                <li key={beach.code}>
                  <Link className={styles.card} href={`/beach/${beach.slug}`}>
                    <span className={styles.name}>{beach.name}</span>
                    <span className={styles.meta}>
                      {[beach.county, miles != null ? `${formatMiles(miles)} ${t.miles}` : null].filter(Boolean).join(" · ")}
                    </span>
                    <StatusChip beach={beach} lang={lang} />
                    {tested && <span className={styles.tested}>{tested}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          {mode === "search" && results.length > SEARCH_COUNT && <p className={styles.note}>{t.showing}</p>}
          <button className={styles.secondary} type="button" onClick={() => setShowMap((open) => !open)}>
            {showMap ? t.hideMap : t.showMap}
          </button>
          {showMap && (
            <>
              <div className={styles.mapWrap}>
                <PublicMap beaches={visible.filter(hasCoordinates)} user={here} youLabel={t.you} lang={lang} />
              </div>
              <p className={styles.legend}>
                <span><i className={styles.swatch} style={{ background: "#3c6435" }} /> {statusPill("Normal", lang)}</span>
                <span><i className={styles.swatch} style={{ background: "#786016" }} /> {statusPill("Slightly elevated", lang)}</span>
                <span><i className={styles.swatch} style={{ background: "#a63d36" }} /> {statusPill("Not recommended", lang)}</span>
                <span><i className={styles.swatch} style={{ background: "#66777b" }} /> {t.noEstimate}</span>
              </p>
              <p className={styles.note}>{t.mapLegend}</p>
            </>
          )}
        </section>
      )}

      <p className={styles.links}>
        <Link className={styles.link} href="/california?view=list">
          {t.browse}
        </Link>
      </p>
    </>
  );
}

function searchRank(beach: GlanceBeach, query: string): number {
  const code = fold(beach.code);
  const name = fold(beach.name);
  const county = fold(beach.county ?? "");
  const slug = fold(beach.slug);
  if (code === query || slug === query) return 0;
  if (name.startsWith(query) || county === query) return 1;
  if (name.includes(query) || county.includes(query) || code.includes(query) || slug.includes(query)) return 2;
  return 4;
}
