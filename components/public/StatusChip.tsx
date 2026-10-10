"use client";

import { formatNeptuneIndex, publishedNeptuneScore } from "@/lib/neptuneIndex";
import { copy, statusPill, bandLabel, type Lang } from "@/lib/publicCopy";
import type { GlanceBeach } from "@/lib/publicBeach";
import { copyReading, officialPosting } from "@/lib/publishedReading";
import styles from "./public.module.css";

const TONE = {
  Normal: styles.under,
  "Slightly elevated": styles.near,
  "Not recommended": styles.over,
} as const;

export function StatusChip({
  beach,
  lang,
}: {
  beach: Pick<
    GlanceBeach,
    | "hasEstimate"
    | "status"
    | "neptuneIndex"
    | "neptuneBand"
    | "tier"
    | "method"
    | "confidence"
    | "postingStatus"
    | "postingSource"
    | "finalStatus"
    | "rainAdvisory"
  >;
  lang: Lang;
}) {
  const posting = officialPosting(copyReading(beach));
  const estimate = <EstimateChip beach={beach} lang={lang} />;
  if (!posting) return estimate;
  return (
    <span className={styles.officialStack}>
      <span className={styles.officialKicker}>
        <span className={styles.officialTag}>{lang === "es" ? "Aviso oficial" : "Official posting"}</span>
        <strong>{posting.label}</strong>
        {posting.source && (
          <span className={styles.officialSource}>
            {lang === "es" ? `Fuente: ${posting.source}` : `Source: ${posting.source}`}
          </span>
        )}
      </span>
      <span className={styles.secondaryEstimate}>
        <span className={styles.estimateLabel}>{lang === "es" ? "Nuestro estimado" : "Our estimate"}</span>
        {estimate}
      </span>
    </span>
  );
}

function EstimateChip({
  beach,
  lang,
}: {
  beach: Pick<GlanceBeach, "hasEstimate" | "status" | "neptuneIndex" | "neptuneBand" | "tier">;
  lang: Lang;
}) {
  const t = copy[lang];
  const score = beach.hasEstimate ? publishedNeptuneScore(beach.neptuneIndex, beach.neptuneBand) : null;
  if (score) {
    return (
      <span className={styles.indexChip} style={{ background: score.band.color, color: score.band.textColor }}>
        <span className={styles.level}>{score.band.level}</span>
        {score.index != null && <strong>{formatNeptuneIndex(score.index)}</strong>}
        <span>{bandLabel(score.band.id, lang)}</span>
      </span>
    );
  }
  if (beach.hasEstimate && beach.status) {
    return <span className={`${styles.pill} ${TONE[beach.status]}`}>{statusPill(beach.status, lang)}</span>;
  }
  return (
    <span className={styles.muted}>
      {t.noEstimate}
      {beach.tier === "limited_data" ? ` · ${t.outsidePool}` : ""}
    </span>
  );
}
