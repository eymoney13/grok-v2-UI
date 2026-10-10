"use client";

import {
  displayBandLabel,
  indexConfidenceNote,
  indexScalePhrase,
  type NeptuneDisplay,
} from "@/lib/neptuneIndex";
import { copy, statusPill, type Lang } from "@/lib/publicCopy";
import type { GlanceBeach } from "@/lib/publicBeach";
import { copyReading, kindTitle, officialPosting, openPostingWords, postingLabel } from "@/lib/publishedReading";
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
    | "neptuneDisplay"
    | "tier"
    | "method"
    | "confidence"
    | "postingStatus"
    | "postingSource"
    | "finalStatus"
    | "postingDate"
    | "rainAdvisory"
  >;
  lang: Lang;
}) {
  const reading = copyReading(beach);
  const posting = officialPosting(reading);
  const estimate = <EstimateChip beach={beach} lang={lang} />;
  if (posting) {
    return (
      <span className={styles.officialStack}>
        <span className={styles.officialKicker}>
          <span className={styles.officialTag}>{kindTitle(posting.kind, lang)}</span>
          <strong>{postingLabel(posting, lang)}</strong>
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
  const open = openPostingWords(reading, lang);
  if (!open) return estimate;
  return (
    <span className={styles.estimateStack}>
      {estimate}
      <span className={styles.postingQuiet}>{open}</span>
    </span>
  );
}

function IndexChip({ display, lang }: { display: NeptuneDisplay; lang: Lang }) {
  const phrase = indexScalePhrase(display, lang);
  const label = displayBandLabel(display, lang);
  const note = indexConfidenceNote(display, lang);
  return (
    <span className={styles.indexStack}>
      <span
        className={`${styles.indexChip} ${display.lowered ? styles.indexChipLowered : ""}`}
        style={display.lowered ? undefined : { background: display.color, color: display.textColor }}
      >
        {phrase && <strong>{phrase}</strong>}
        {label && <span>{label}</span>}
      </span>
      {note && <span className={styles.indexNote}>{note}</span>}
    </span>
  );
}

function EstimateChip({
  beach,
  lang,
}: {
  beach: Pick<GlanceBeach, "hasEstimate" | "status" | "neptuneDisplay" | "tier">;
  lang: Lang;
}) {
  const t = copy[lang];
  if (beach.neptuneDisplay) return <IndexChip display={beach.neptuneDisplay} lang={lang} />;
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
