"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SwimAnswer } from "@/components/public/SwimAnswer";
import type { BeachListItem } from "@/lib/data";
import { formatMonthDayYear } from "@/lib/data";
import {
  LONG_BEACH_ID,
  LONG_BEACH_LABEL,
  LONG_BEACH_NOTE,
  answerGroup,
  bandsInUse,
  coastGroupId,
  countyCards,
  isOfficialPosting,
  matchesCoast,
  neverTestedBeach,
} from "@/lib/coastBoard";
import type { IndexScale } from "@/lib/neptuneIndex";
import { staleCountyBanner } from "@/lib/publicCopy";
import styles from "./coast.module.css";

const OverviewMapClient = dynamic(() => import("@/components/OverviewMapClient"), {
  ssr: false,
  loading: () => <p className={styles.note}>Loading map…</p>,
});

export default function CoastBoard({
  beaches,
  predictionDate,
  readingsCurrent,
  fallbackCenter,
  staleCounties,
  checksPassed,
  indexScale,
  initialGroup = "",
}: {
  beaches: BeachListItem[];
  predictionDate: string;
  readingsCurrent: boolean;
  fallbackCenter: [number, number];
  staleCounties: string[];
  checksPassed: boolean | null;
  indexScale: IndexScale | null;
  initialGroup?: string;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(initialGroup);
  const [answer, setAnswer] = useState<"" | "safe" | "caution" | "unsafe">("");
  const [tier, setTier] = useState<"" | "model_pool" | "limited_data">("");
  const [postedOnly, setPostedOnly] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const router = useRouter();
  const bands = useMemo(() => bandsInUse(indexScale), [indexScale]);

  const cards = useMemo(() => countyCards(beaches, staleCounties), [beaches, staleCounties]);
  const unsafeCount = useMemo(() => beaches.filter((beach) => answerGroup(beach) === "unsafe").length, [beaches]);
  const filtered = useMemo(() => {
    return beaches.filter((beach) => {
      if (group && coastGroupId(beach) !== group) return false;
      if (answer && answerGroup(beach) !== answer) return false;
      if (tier && beach.tier !== tier) return false;
      if (postedOnly && !isOfficialPosting(beach)) return false;
      return matchesCoast(beach, query);
    });
  }, [answer, beaches, group, postedOnly, query, tier]);

  const stale = staleCountyBanner(staleCounties, "en");
  const activeCounty = cards.find((card) => card.id === group) ?? null;

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/">
        Back
      </Link>
      <h1>California beaches</h1>
      <p className={styles.lead}>The list is the whole coast. The map stays hidden until you ask for it.</p>
      {bands.length > 0 && (
        <p className={styles.note}>
          A lower number is cleaner water.{" "}
          {bands.map((band) => `${band.label} ${band.min}–${band.max}`).join(". ")}.
        </p>
      )}
      {predictionDate && !readingsCurrent && (
        <p className={styles.stale} role="status">
          These readings are for {formatMonthDayYear(predictionDate)}, not today.
        </p>
      )}
      {checksPassed === false && (
        <p className={styles.stale} role="status">
          Today’s numbers need extra caution. A check on the latest update did not pass.
        </p>
      )}
      {stale && (
        <p className={styles.stale} role="status">
          {stale}
        </p>
      )}

      <div className={styles.pin}>
        <button type="button" aria-pressed={group === LONG_BEACH_ID} onClick={() => setGroup(group === LONG_BEACH_ID ? "" : LONG_BEACH_ID)}>
          {LONG_BEACH_LABEL}
        </button>
        <button type="button" aria-pressed={answer === "unsafe"} onClick={() => setAnswer(answer === "unsafe" ? "" : "unsafe")}>
          Not safe today ({unsafeCount})
        </button>
        <button type="button" aria-pressed={showMap} onClick={() => setShowMap((open) => !open)}>
          {showMap ? "Hide map" : "See map"}
        </button>
      </div>

      <form
        className={styles.search}
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label htmlFor="coast-search">Find your beach</label>
        <div className={styles.searchRow}>
          <input
            id="coast-search"
            value={query}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit">Search</button>
        </div>
      </form>

      <div className={styles.filters}>
        <div className={styles.field}>
          <label htmlFor="coast-answer">Water</label>
          <select id="coast-answer" value={answer} onChange={(event) => setAnswer(event.target.value as typeof answer)}>
            <option value="">Any</option>
            <option value="safe">Safe to swim</option>
            <option value="caution">Use caution</option>
            <option value="unsafe">Not safe</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="coast-tier">Testing history</label>
          <select id="coast-tier" value={tier} onChange={(event) => setTier(event.target.value as typeof tier)}>
            <option value="">Any</option>
            <option value="model_pool">Well tested</option>
            <option value="limited_data">Limited data</option>
          </select>
        </div>
        <button type="button" aria-pressed={postedOnly} onClick={() => setPostedOnly((on) => !on)}>
          Official warning or closure
        </button>
      </div>

      <ul className={styles.counties} aria-label="Counties">
        {cards.map((card) => (
          <li key={card.id}>
            <button type="button" aria-pressed={group === card.id} onClick={() => setGroup(group === card.id ? "" : card.id)}>
              <span className={styles.countyName}>{card.label}</span>
              <span>
                {card.safe} Safe to swim · {card.caution} Use caution · {card.unsafe} Not safe
              </span>
              {card.stale && <span>Older data than usual</span>}
            </button>
          </li>
        ))}
      </ul>

      {activeCounty?.id === LONG_BEACH_ID && <p className={styles.note}>{LONG_BEACH_NOTE}</p>}

      <p className={styles.note}>
        {filtered.length} of {beaches.length} beaches
      </p>

      {showMap && (
        <div className={styles.mapFrame}>
          <OverviewMapClient
            beaches={filtered}
            fallbackCenter={fallbackCenter}
            binaryVerdict={false}
            cluster
            onSelect={(id) => router.push(`/beach/${id}`)}
          />
        </div>
      )}

      <ul className={styles.list}>
        {filtered.map((beach) => {
          const untested = neverTestedBeach(beach);
          return (
            <li key={beach.id}>
              <Link className={styles.card} href={`/beach/${beach.id}`} prefetch={false}>
                <span className={styles.name}>{beach.name}</span>
                <span className={styles.meta}>
                  {[beach.code, coastGroupId(beach) === LONG_BEACH_ID ? LONG_BEACH_LABEL : beach.county, beach.tier === "limited_data" ? "Limited data" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <SwimAnswer
                  beach={{ ...beach, neverTested: untested }}
                  lang="en"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
