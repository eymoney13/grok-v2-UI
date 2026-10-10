import { POSTING_LABEL } from "./readerLabels.ts";

/**
 * Fields on the v2 daily output (`outputs/daily/current.csv`).
 *
 * These parsers accept the columns wherever a row already exists. A missing
 * column stays null. Nothing here turns a probability or a rain total into a
 * posting, a method, or a confidence level.
 */

export type EstimateMethod = "model" | "pooled_model" | "rules";
export type ConfidenceLevel = "high" | "medium" | "low";
/** County feed values. Missing is null, which is not the same as `unknown`. */
export type PostingStatus = "closure" | "warning" | "advisory" | "open" | "unknown";
export type ActivePosting = "closure" | "warning" | "advisory";

export interface PublishedReading {
  method: EstimateMethod | null;
  confidence: ConfidenceLevel | null;
  postingStatus: PostingStatus | null;
  postingSource: string | null;
  finalStatus: string | null;
  /** Day the county check applies to, YYYY-MM-DD. Null when the file did not give one. */
  postingDate: string | null;
  /** True only when the file says so. Null means the file did not flag it. */
  rainAdvisory: boolean | null;
}

export const EMPTY_READING: PublishedReading = {
  method: null,
  confidence: null,
  postingStatus: null,
  postingSource: null,
  finalStatus: null,
  postingDate: null,
  rainAdvisory: null,
};

const METHOD_KEYS = ["method", "estimate_method", "estimateMethod"];
const CONFIDENCE_LEVEL_KEYS = ["confidence", "confidence_level", "confidenceLevel"];
const POSTING_STATUS_KEYS = ["posting_status", "postingStatus"];
const POSTING_SOURCE_KEYS = ["posting_source", "postingSource"];
const FINAL_STATUS_KEYS = ["final_status", "finalStatus"];
const POSTING_DATE_KEYS = [
  "posting_fetched_at",
  "postingFetchedAt",
  "posting_date",
  "postingDate",
  "checked_date",
  "checkedDate",
  "as_of",
  "asOf",
];
const GENERATED_DATE_KEYS = ["generated_at", "generatedAt"];
const RAIN_ADVISORY_KEYS = ["rain_advisory", "rainAdvisory", "recent_rain", "recentRain"];

export interface OfficialPosting {
  kind: ActivePosting;
  /** `final_status` when the file published one. Otherwise the page uses the kind name. */
  detail: string | null;
  source: string | null;
}

export function parseMethod(raw: unknown): EstimateMethod | null {
  if (raw == null || raw === "") return null;
  const text = String(raw).trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (text === "model") return "model";
  if (text === "pooled model" || text === "pooled") return "pooled_model";
  if (text === "rules" || text === "rule") return "rules";
  return null;
}

/**
 * Whether a forecast lead is ready to drop the Experimental label.
 * `go_live` is the only value that does. `experimental` keeps the label.
 * high, medium, and low are confidence levels, not this flag.
 */
export type LeadMaturity = "go_live" | "experimental";

export function parseLeadMaturity(raw: unknown): LeadMaturity | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return null;
  if (typeof raw === "boolean") return raw ? "go_live" : "experimental";
  const text = String(raw).trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (text === "go live" || text === "golive") return "go_live";
  if (text === "experimental" || text === "experiment") return "experimental";
  return null;
}

/** high, medium, or low. A number or any other word is not a confidence level. */
export function parseConfidenceLevel(raw: unknown): ConfidenceLevel | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return null;
  const text = String(raw).trim().toLowerCase();
  if (text === "high" || text === "medium" || text === "low") return text;
  return null;
}

function textOrNull(raw: unknown): string | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  return text === "" ? null : text;
}

function first(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return row[key];
  }
  return null;
}

function asBool(raw: unknown): boolean | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "boolean") return raw;
  const text = String(raw).trim().toLowerCase();
  if (text === "true" || text === "1" || text === "yes" || text === "y") return true;
  if (text === "false" || text === "0" || text === "no" || text === "n") return false;
  return null;
}

/**
 * The rules path had no recent data to make a call.
 * This is the word `Unknown` on `call`, `prediction`, or `final_status`.
 * It is not `posting_status: unknown`, which means the county feed had no posting.
 */
export function isUnknownCall(raw: unknown): boolean {
  return String(raw ?? "").trim().toLowerCase() === "unknown";
}

/** True when this beach or day published that no-call word. */
export function showsUnknownCall(
  source: { callUnknown?: boolean; finalStatus?: string | null } | null | undefined
): boolean {
  return source?.callUnknown === true || isUnknownCall(source?.finalStatus);
}

/** closure, warning, advisory, open, or unknown. Any other word, including "safe", is ignored. */
export function parsePostingStatus(raw: unknown): PostingStatus | null {
  if (raw == null || raw === "") return null;
  const text = String(raw).trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (text === "closure" || text === "closed" || text === "close") return "closure";
  if (text === "warning" || text === "warn") return "warning";
  if (text === "advisory") return "advisory";
  if (text === "open") return "open";
  if (text === "unknown") return "unknown";
  return null;
}

function dateOnly(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const match = String(raw).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function parsePublishedReading(row: Record<string, unknown> | null | undefined): PublishedReading {
  if (!row) return { ...EMPTY_READING };
  const postingStatus = parsePostingStatus(first(row, POSTING_STATUS_KEYS));
  const explicitDate = dateOnly(first(row, POSTING_DATE_KEYS));
  const generatedDate = postingStatus ? dateOnly(first(row, GENERATED_DATE_KEYS)) : null;
  return {
    method: parseMethod(first(row, METHOD_KEYS)),
    confidence: parseConfidenceLevel(first(row, CONFIDENCE_LEVEL_KEYS)),
    postingStatus,
    postingSource: textOrNull(first(row, POSTING_SOURCE_KEYS)),
    finalStatus: textOrNull(first(row, FINAL_STATUS_KEYS)),
    postingDate: explicitDate ?? generatedDate,
    rainAdvisory: asBool(first(row, RAIN_ADVISORY_KEYS)),
  };
}

/** Use the daily file clock when a posting row did not carry its own date. */
export function withPostingFileDate(reading: PublishedReading, generatedAt: string | null | undefined): PublishedReading {
  if (reading.postingDate || !reading.postingStatus || !generatedAt) return reading;
  const date = dateOnly(generatedAt);
  return date ? { ...reading, postingDate: date } : reading;
}

/** First non-null field wins. Pass the newest file first. */
export function mergeReadings(...parts: (PublishedReading | null | undefined)[]): PublishedReading {
  const merged: PublishedReading = { ...EMPTY_READING };
  const keys = Object.keys(EMPTY_READING) as (keyof PublishedReading)[];
  for (const part of parts) {
    if (!part) continue;
    for (const key of keys) {
      if (merged[key] == null && part[key] != null) {
        merged[key] = part[key] as never;
      }
    }
  }
  return merged;
}

/**
 * A closure, warning, or advisory overrides our status.
 * `open` and `unknown` do not. `final_status` alone does not, because that
 * column may only repeat the prediction when no county posting exists.
 */
export function officialPosting(reading: PublishedReading | null | undefined): OfficialPosting | null {
  const kind = reading?.postingStatus;
  if (kind !== "closure" && kind !== "warning" && kind !== "advisory") return null;
  const rawDetail = reading?.finalStatus?.trim() || null;
  // "Unknown" is the rules-path no-call, not a county label such as "Beach closed".
  const detail = rawDetail && !isUnknownCall(rawDetail) ? rawDetail : null;
  const source = reading?.postingSource?.trim() || null;
  return { kind, detail, source };
}

export function kindTitle(kind: ActivePosting, lang: ReadingLang = "en"): string {
  return POSTING_LABEL[lang][kind].title;
}

function kindLabel(kind: ActivePosting, lang: ReadingLang): string {
  return POSTING_LABEL[lang][kind].label;
}

export function postingLabel(posting: OfficialPosting, lang: ReadingLang = "en"): string {
  return posting.detail ?? kindLabel(posting.kind, lang);
}

/** Short pin text. A long county label falls back to the kind name, never to "safe". */
export function postingPinText(posting: OfficialPosting): string {
  const label = postingLabel(posting, "en");
  return label.length > 0 && label.length <= 14 ? label : kindLabel(posting.kind, "en");
}

export type ReadingLang = "en" | "es";

/** Same fields, with anything missing filled in as null. */
export function copyReading(source: Partial<PublishedReading> | null | undefined): PublishedReading {
  return {
    method: source?.method ?? null,
    confidence: source?.confidence ?? null,
    postingStatus: source?.postingStatus ?? null,
    postingSource: source?.postingSource ?? null,
    finalStatus: source?.finalStatus ?? null,
    postingDate: source?.postingDate ?? null,
    rainAdvisory: source?.rainAdvisory ?? null,
  };
}

/** Short labels for a list row. The beach page uses the full sentence. */
export function methodShort(method: EstimateMethod | null | undefined): string | null {
  if (method === "model") return "This beach’s model";
  if (method === "pooled_model") return "Pooled model";
  if (method === "rules") return "Lab test + rain rule";
  return null;
}

export function methodWords(method: EstimateMethod | null | undefined, lang: ReadingLang = "en"): string | null {
  if (method === "model") {
    return lang === "es" ? "Basado en el modelo de esta playa." : "Based on this beach’s model.";
  }
  if (method === "pooled_model") {
    return lang === "es"
      ? "Basado en un modelo conjunto, compartido entre playas."
      : "Based on a pooled model, shared across beaches.";
  }
  if (method === "rules") {
    return lang === "es"
      ? "Basado en la última prueba de laboratorio y la regla de lluvia."
      : "Based on last lab test + rain rule.";
  }
  return null;
}

export interface ConfidenceCopy {
  level: ConfidenceLevel;
  text: string;
}

export function confidenceWords(level: ConfidenceLevel | null | undefined, lang: ReadingLang = "en"): ConfidenceCopy | null {
  if (level === "high") {
    return { level, text: lang === "es" ? "Confianza alta." : "High confidence." };
  }
  if (level === "medium") {
    return { level, text: lang === "es" ? "Confianza media." : "Medium confidence." };
  }
  if (level === "low") {
    return {
      level,
      text:
        lang === "es"
          ? "Confianza baja. Esta lectura es menos segura que una de confianza alta."
          : "Low confidence. This reading is less certain than a high-confidence one.",
    };
  }
  return null;
}

/** The rules path flagged recent rain. A wet total in the weather file is not this note. */
export function rainAdvisoryWords(reading: PublishedReading | null | undefined, lang: ReadingLang = "en"): string | null {
  if (reading?.method !== "rules" || reading.rainAdvisory !== true) return null;
  return lang === "es"
    ? "Aviso de lluvia. La ruta de reglas marcó lluvia reciente."
    : "Rain advisory. The rules path flagged recent rain.";
}

function formatReadingDate(iso: string, lang: ReadingLang): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(lang === "es" ? "es-US" : "en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The county feed checked this beach and listed nothing active.
 * This is not a water-quality status and it is not "safe".
 */
export function openPostingWords(reading: PublishedReading | null | undefined, lang: ReadingLang = "en"): string | null {
  if (reading?.postingStatus !== "open") return null;
  const base = lang === "es" ? "Hoy no hay avisos activos del condado." : "No active county postings today.";
  const source = reading.postingSource?.trim()
    ? lang === "es"
      ? ` Fuente: ${reading.postingSource.trim()}.`
      : ` Source: ${reading.postingSource.trim()}.`
    : "";
  const date = reading.postingDate ? ` ${formatReadingDate(reading.postingDate, lang)}.` : "";
  return `${base}${source}${date}`;
}

/**
 * The feed has no posting for this beach. Calm, and never a substitute for "safe".
 * A missing column is not this case — only an explicit `unknown`.
 */
export function unknownPostingWords(reading: PublishedReading | null | undefined, lang: ReadingLang = "en"): string | null {
  if (reading?.postingStatus !== "unknown") return null;
  return lang === "es"
    ? "No hay datos de avisos oficiales para esta playa."
    : "No official posting data for this beach.";
}

export function officialSummaryLead(posting: OfficialPosting, modelSentence: string, lang: ReadingLang = "en"): string {
  const source = posting.source
    ? lang === "es"
      ? ` Fuente: ${posting.source}.`
      : ` Source: ${posting.source}.`
    : "";
  const label = postingLabel(posting, lang);
  const title = kindTitle(posting.kind, lang);
  const head = title.trim().toLowerCase() === label.trim().toLowerCase() ? `${title}.` : `${title}: ${label}.`;
  return lang === "es"
    ? `${head}${source} Nuestro estimado: ${modelSentence}`
    : `${head}${source} Our estimate: ${modelSentence}`;
}
