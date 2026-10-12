import { displayBandLabel, formatNeptuneIndex, indexReading, swimWords, type NeptuneDisplay } from "@/lib/neptuneIndex";
import { copy, forecastPendingPhrase, notTestedPhrase, unknownCallPhrase, type Lang } from "@/lib/publicCopy";
import type { GlanceBeach } from "@/lib/publicBeach";
import { copyReading, officialPosting, postingHeadline, showsUnknownCall } from "@/lib/publishedReading";
import styles from "./public.module.css";

export function SwimAnswer({
  beach,
  lang,
  size = "list",
}: {
  beach: Pick<
    GlanceBeach,
    | "hasEstimate"
    | "status"
    | "neptuneDisplay"
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
  size?: "list" | "hero";
}) {
  const reading = copyReading(beach);
  const posting = officialPosting(reading);
  const hero = size === "hero" ? styles.answerHero : "";

  if (posting && (posting.kind === "warning" || posting.kind === "closure")) {
    const headline = postingHeadline(posting, lang);
    const display = beach.neptuneDisplay;
    const number = display?.index != null ? formatNeptuneIndex(display.index) : null;
    const band = display?.bandId ? displayBandLabel(display, lang) : null;
    return (
      <div className={`${styles.answer} ${styles.answerSerious} ${hero}`} style={{ background: "#4a0e0e", color: "#ffffff" }} role="status">
        <p className={styles.answerWords}>{headline.title}</p>
        <p className={styles.answerPlain}>{swimWords("very_likely_unsafe", lang)}</p>
        {number && <p className={styles.answerNumber}>{number}</p>}
        {band && band !== swimWords("very_likely_unsafe", lang) && <p className={styles.answerBand}>{band}</p>}
        {posting.source && (
          <p className={styles.answerMeta}>{lang === "es" ? `Fuente: ${posting.source}` : `Source: ${posting.source}`}</p>
        )}
      </div>
    );
  }

  const index = beach.neptuneDisplay ? <IndexAnswer display={beach.neptuneDisplay} lang={lang} hero={hero} /> : null;
  if (posting?.kind === "advisory") {
    const headline = postingHeadline(posting, lang);
    return (
      <div>
        <div className={`${styles.answer} ${styles.answerSerious} ${hero}`} style={{ background: "#4a0e0e", color: "#ffffff" }} role="status">
          <p className={styles.answerWords}>{headline.title}</p>
          {posting.source && (
            <p className={styles.answerMeta}>{lang === "es" ? `Fuente: ${posting.source}` : `Source: ${posting.source}`}</p>
          )}
        </div>
        {index}
      </div>
    );
  }

  if (beach.neverTested) {
    return (
      <div className={`${styles.answer} ${hero}`} role="status">
        <p className={styles.answerWords}>{notTestedPhrase(lang)}</p>
      </div>
    );
  }

  if (beach.forecastPending) {
    return (
      <div className={`${styles.answer} ${hero}`} role="status">
        <p className={styles.answerWords}>{forecastPendingPhrase(lang)}</p>
      </div>
    );
  }

  if (index) return index;

  if (showsUnknownCall(beach)) {
    return (
      <div className={`${styles.answer} ${hero}`} role="status">
        <p className={styles.answerWords}>{unknownCallPhrase(lang)}</p>
      </div>
    );
  }

  return (
    <div className={`${styles.answer} ${hero}`} role="status">
      <p className={styles.answerWords}>{beach.hasEstimate ? copy[lang].awaiting : copy[lang].noEstimate}</p>
    </div>
  );
}

function IndexAnswer({ display, lang, hero }: { display: NeptuneDisplay; lang: Lang; hero: string }) {
  const reading = indexReading(display, lang);
  const serious = display.labOverride || display.bandId === "likely_unsafe" || display.bandId === "very_likely_unsafe";
  return (
    <div
      className={`${styles.answer} ${hero} ${serious ? styles.answerSerious : ""}`}
      style={{ background: display.color, color: display.textColor }}
      role="status"
    >
      {reading.plain && <p className={styles.answerWords}>{reading.plain}</p>}
      {display.index != null && <p className={styles.answerNumber}>{formatNeptuneIndex(display.index)}</p>}
      {reading.label && reading.plain !== reading.label && <p className={styles.answerBand}>{reading.label}</p>}
      {reading.note && <p className={styles.answerMeta}>{reading.note}</p>}
    </div>
  );
}
