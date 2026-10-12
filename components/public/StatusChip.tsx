"use client";

import { copy, type Lang } from "@/lib/publicCopy";
import type { GlanceBeach } from "@/lib/publicBeach";
import { SwimAnswer } from "./SwimAnswer";
import styles from "./public.module.css";

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
    | "callUnknown"
    | "neverTested"
    | "forecastPending"
  >;
  lang: Lang;
}) {
  return (
    <span className={styles.indexStack}>
      <SwimAnswer beach={beach} lang={lang} />
      {beach.tier === "limited_data" && <span className={styles.badge}>{copy[lang].limitedBadge}</span>}
    </span>
  );
}
