import type { NeptuneBandId } from "../config/neptune-index.ts";
import { EPA_MPN_THRESHOLD, type Status } from "./data.ts";
import {
  FORECAST_EXPERIMENTAL_EXPLANATION,
  FORECAST_HIDDEN_STATION_NOTE,
  type ForecastHorizon,
} from "./forecastDisplay.ts";
import { formatNeptuneIndex, publishedNeptuneScore } from "./neptuneIndex.ts";
import {
  BAND_GUIDANCE_ES,
  bandLabel,
  statusDetail,
  statusPhrase,
  type Lang,
} from "./publicCopy.ts";
import type { OutlookDay, PublicBeach } from "./publicBeach.ts";
import {
  confidenceWords,
  copyReading,
  methodWords,
  officialPosting,
  officialSummaryLead,
  openPostingWords,
  rainAdvisoryWords,
  unknownPostingWords,
  type ConfidenceLevel,
  type EstimateMethod,
  type PostingStatus,
} from "./publishedReading.ts";
import { rainDepth, rainState, rainTotalMm } from "./rain.ts";
import {
  TIER_LIMITED_NOTE,
  freshnessLimit,
  hasLimitedLabData,
  limitedLabNote,
} from "./waterStatus.ts";

export interface SummaryFacts {
  hasEstimate: boolean;
  status: Status | null;
  neptuneIndex: number | null;
  neptuneBand: string | null;
  daysSinceSample: number | null;
  noRecentSample: boolean;
  staleAfterDays: number | null;
  county: string | null;
  tier: PublicBeach["tier"];
  horizon: ForecastHorizon;
  outlook: OutlookDay[];
  rainTodayMm: number | null;
  rainPrior3dMm: number | null;
  lastResultMpn: number | null;
  fallbackUsed: boolean | null;
  method: EstimateMethod | null;
  confidence: ConfidenceLevel | null;
  postingStatus: PostingStatus | null;
  postingSource: string | null;
  finalStatus: string | null;
  postingDate: string | null;
  rainAdvisory: boolean | null;
}

export interface DailySummary {
  status: string;
  lastTested: string | null;
  limitedLab: string | null;
  tierNote: string | null;
  outlookLabel: string;
  outlook: string;
  rain: string | null;
  recentResult: string | null;
  fallback: string | null;
  method: string | null;
  confidence: { level: ConfidenceLevel; text: string } | null;
  /** Rules-path rain note. Separate from the weather-file rain sentence. */
  rainAdvisory: string | null;
  /** Open or unknown county feed. Never a stand-in for a safe water reading. */
  postingNote: string | null;
}

const EXPERIMENTAL_ES =
  "Estos tres días siguientes todavía se están probando. La lectura de hoy es la que se compara con las muestras de laboratorio.";

const HIDDEN_ES = "No se muestra un pronóstico de varios días para esta playa.";

const NO_OUTLOOK_EN = `No day-ahead outlook was published for this beach. ${FORECAST_EXPERIMENTAL_EXPLANATION}`;
const NO_OUTLOOK_ES = `No se publicó un pronóstico para los próximos días de esta playa. ${EXPERIMENTAL_ES}`;

const TIER_ES =
  "Esta playa está en la lista como datos limitados. Está fuera del grupo del modelo, así que puede que hoy no haya un estimado.";

/**
 * Day-ahead statuses a public page may name.
 * Locked days are withheld on purpose, and their placeholder status is not a reading.
 * A hidden horizon contributes no days, so the page cannot describe a direction.
 */
export function publishedOutlook(
  days: { date: string; status: Status; locked?: boolean; experimental?: boolean }[],
  predictionDate: string,
  horizon: ForecastHorizon
): OutlookDay[] {
  if (horizon !== "label") return [];
  return days
    .filter((day) => !day.locked && day.date > predictionDate && day.status)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)
    .map((day) => ({
      date: day.date,
      status: day.status,
      experimental: day.experimental !== false,
    }));
}

/** One beach. A coast-wide count does not belong in this sentence. */
export function dailySummary(facts: SummaryFacts, lang: Lang): DailySummary {
  return {
    status: statusSentence(facts, lang),
    lastTested: lastTestedSentence(facts.daysSinceSample, lang),
    limitedLab: hasLimitedLabData(facts.daysSinceSample, facts.noRecentSample, facts.staleAfterDays)
      ? limitedSentence(facts.staleAfterDays, facts.county, lang)
      : null,
    tierNote: facts.tier === "limited_data" ? (lang === "es" ? TIER_ES : TIER_LIMITED_NOTE) : null,
    outlookLabel: outlookLabel(facts, lang),
    outlook: outlookSentence(facts, lang),
    rain: rainSentence(facts, lang),
    rainAdvisory: rainAdvisoryWords(copyReading(facts), lang),
    postingNote: openPostingWords(copyReading(facts), lang) ?? unknownPostingWords(copyReading(facts), lang),
    method: methodWords(facts.method, lang),
    confidence: confidenceWords(facts.confidence, lang),
    recentResult: recentSentence(facts.lastResultMpn, lang),
    fallback:
      facts.fallbackUsed === true
        ? lang === "es"
          ? "El archivo del modelo marca esta lectura como un método de respaldo."
          : "The model file marks this reading as a fallback."
        : null,
  };
}

export function glanceLine(
  beach: Pick<PublicBeach, "daysSinceSample" | "noRecentSample" | "staleAfterDays">,
  lang: Lang
): string | null {
  const tested = lastTestedSentence(beach.daysSinceSample, lang);
  const limited = hasLimitedLabData(beach.daysSinceSample, beach.noRecentSample, beach.staleAfterDays);
  if (limited) {
    const label = lang === "es" ? "Datos de laboratorio limitados" : "Limited lab data";
    return tested ? `${tested} · ${label}` : label;
  }
  return tested;
}

function statusSentence(facts: SummaryFacts, lang: Lang): string {
  const model = modelSentence(facts, lang);
  const posting = officialPosting(copyReading(facts));
  if (posting) return officialSummaryLead(posting, model, lang);
  return model;
}

function modelSentence(facts: SummaryFacts, lang: Lang): string {
  if (!facts.hasEstimate) {
    return lang === "es"
      ? "Hoy no se publicó un estimado para esta playa."
      : "No estimate was published for this beach today.";
  }
  const score = publishedNeptuneScore(facts.neptuneIndex, facts.neptuneBand);
  if (score) {
    const label = bandLabel(score.band.id, lang);
    const guidance = lang === "es" ? BAND_GUIDANCE_ES[score.band.id as NeptuneBandId] : score.band.guidance;
    if (score.index != null) {
      const number = formatNeptuneIndex(score.index);
      return lang === "es"
        ? `El índice Neptune de hoy es ${number}, ${label}. ${guidance}`
        : `Today’s Neptune Index is ${number}, ${label}. ${guidance}`;
    }
    return lang === "es"
      ? `La banda del índice Neptune de hoy es ${label}. No se publicó un número con ella. ${guidance}`
      : `Today’s Neptune Index band is ${label}. No number was published with it. ${guidance}`;
  }
  if (facts.status) return statusDetail(facts.status, lang);
  return lang === "es"
    ? "Hoy no se publicó un estimado para esta playa."
    : "No estimate was published for this beach today.";
}

function lastTestedSentence(days: number | null, lang: Lang): string | null {
  if (days == null || !Number.isFinite(days)) return null;
  const n = Math.max(0, Math.round(days));
  if (lang === "es") {
    if (n === 0) return "Última prueba de laboratorio: hoy";
    if (n === 1) return "Última prueba de laboratorio: hace 1 día";
    return `Última prueba de laboratorio: hace ${n} días`;
  }
  if (n === 0) return "Last lab test: today";
  if (n === 1) return "Last lab test: 1 day ago";
  return `Last lab test: ${n} days ago`;
}

function limitedSentence(staleAfterDays: number | null, county: string | null, lang: Lang): string {
  if (lang === "en") return limitedLabNote(staleAfterDays, county);
  const limit = freshnessLimit(staleAfterDays);
  if (staleAfterDays != null && county) {
    return `Datos de laboratorio limitados. ${county} trata una prueba de agua como limitada después de ${limit} días, así que este estimado se apoya en el clima y las mareas hasta la próxima prueba.`;
  }
  if (staleAfterDays != null) {
    return `Datos de laboratorio limitados. Una prueba de agua de más de ${limit} días es limitada, así que este estimado se apoya en el clima y las mareas hasta la próxima prueba.`;
  }
  return "Datos de laboratorio limitados. Muchas playas se analizan solo de vez en cuando, así que este estimado se apoya en el clima y las mareas hasta la próxima prueba de agua.";
}

function everyLeadGoLive(facts: SummaryFacts): boolean {
  return facts.horizon === "label" && facts.outlook.length > 0 && facts.outlook.every((day) => day.experimental === false);
}

function outlookLabel(facts: SummaryFacts, lang: Lang): string {
  if (everyLeadGoLive(facts)) return lang === "es" ? "Pronóstico" : "Outlook";
  return "Experimental";
}

function outlookSentence(facts: SummaryFacts, lang: Lang): string {
  if (facts.horizon !== "label") return lang === "es" ? HIDDEN_ES : FORECAST_HIDDEN_STATION_NOTE;
  if (facts.outlook.length === 0) return lang === "es" ? NO_OUTLOOK_ES : NO_OUTLOOK_EN;
  const parts = facts.outlook.map((day) => {
    const name = weekday(day.date, lang);
    const phrase = statusPhrase(day.status, lang);
    return lang === "es" ? `${name} está ${phrase}` : `${name} is ${phrase}`;
  });
  const list = joinList(parts, lang);
  if (everyLeadGoLive(facts)) return `${list}.`;
  return lang === "es" ? `${list}. ${EXPERIMENTAL_ES}` : `${list}. ${FORECAST_EXPERIMENTAL_EXPLANATION}`;
}

function rainSentence(facts: SummaryFacts, lang: Lang): string | null {
  const total = rainTotalMm({
    rainTodayMm: facts.rainTodayMm ?? undefined,
    rainPrior3dMm: facts.rainPrior3dMm ?? undefined,
  });
  if (total == null) return null;
  const state = rainState(total);
  const depth = rainDepth(total);
  if (lang === "es") {
    if (state === "none") return "El archivo del clima no muestra lluvia hoy ni en los tres días anteriores.";
    if (state === "trace") {
      return `El archivo del clima muestra ${depth} de lluvia entre hoy y los tres días anteriores. Está por debajo de la línea de 2.54 mm que el modelo usa para un período húmedo.`;
    }
    return `El archivo del clima muestra ${depth} de lluvia entre hoy y los tres días anteriores. Llega a la línea de 2.54 mm que el modelo trata como un período húmedo.`;
  }
  if (state === "none") return "The weather file shows no rain today or over the three days before it.";
  if (state === "trace") {
    return `The weather file shows ${depth} of rain across today and the three days before it. That is below the 2.54 mm line the model uses for a wet period.`;
  }
  return `The weather file shows ${depth} of rain across today and the three days before it. That is at or over the 2.54 mm line the model treats as wet.`;
}

function recentSentence(mpn: number | null, lang: Lang): string | null {
  if (mpn == null || !Number.isFinite(mpn)) return null;
  const shown = Number.isInteger(mpn) ? String(mpn) : mpn.toFixed(1);
  const relation = mpn < EPA_MPN_THRESHOLD ? "under" : mpn > EPA_MPN_THRESHOLD ? "over" : "at";
  if (lang === "es") {
    const word = relation === "under" ? "bajo" : relation === "over" ? "sobre" : "en";
    return `El último resultado de laboratorio en el archivo es ${shown} MPN/100 mL, ${word} el límite de ${EPA_MPN_THRESHOLD} MPN/100 mL.`;
  }
  return `The latest lab result in the file is ${shown} MPN/100 mL, ${relation} the ${EPA_MPN_THRESHOLD} MPN/100 mL limit.`;
}

function weekday(iso: string, lang: Lang): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const name = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(lang === "es" ? "es-US" : "en-US", {
    timeZone: "UTC",
    weekday: "long",
  });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function joinList(items: string[], lang: Lang): string {
  if (items.length <= 1) return items[0] ?? "";
  const and = lang === "es" ? "y" : "and";
  if (items.length === 2) return `${items[0]} ${and} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}
