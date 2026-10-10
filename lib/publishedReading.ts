/**
 * Optional fields on the v2 daily output.
 *
 * The file path is not settled. These parsers accept the columns wherever a
 * row already exists, and the adapter also looks for a current file plus a
 * dated history folder. A missing column stays null. Nothing here turns a
 * probability or a rain total into a posting, a method, or a confidence level.
 */

export type EstimateMethod = "model" | "pooled_model" | "rules";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface PublishedReading {
  method: EstimateMethod | null;
  confidence: ConfidenceLevel | null;
  postingStatus: string | null;
  postingSource: string | null;
  finalStatus: string | null;
  /** True only when the file says so. Null means the file did not flag it. */
  rainAdvisory: boolean | null;
}

export const EMPTY_READING: PublishedReading = {
  method: null,
  confidence: null,
  postingStatus: null,
  postingSource: null,
  finalStatus: null,
  rainAdvisory: null,
};

const METHOD_KEYS = ["method", "estimate_method", "estimateMethod"];
const CONFIDENCE_LEVEL_KEYS = ["confidence", "confidence_level", "confidenceLevel"];
const POSTING_STATUS_KEYS = ["posting_status", "postingStatus"];
const POSTING_SOURCE_KEYS = ["posting_source", "postingSource"];
const FINAL_STATUS_KEYS = ["final_status", "finalStatus"];
const RAIN_ADVISORY_KEYS = ["rain_advisory", "rainAdvisory", "recent_rain", "recentRain"];

export interface OfficialPosting {
  /** The words shown largest. `final_status` when the file published one, otherwise the posting itself. */
  label: string;
  /** The posting text, kept when it differs from the final label. */
  posted: string;
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

export function parsePublishedReading(row: Record<string, unknown> | null | undefined): PublishedReading {
  if (!row) return { ...EMPTY_READING };
  return {
    method: parseMethod(first(row, METHOD_KEYS)),
    confidence: parseConfidenceLevel(first(row, CONFIDENCE_LEVEL_KEYS)),
    postingStatus: textOrNull(first(row, POSTING_STATUS_KEYS)),
    postingSource: textOrNull(first(row, POSTING_SOURCE_KEYS)),
    finalStatus: textOrNull(first(row, FINAL_STATUS_KEYS)),
    rainAdvisory: asBool(first(row, RAIN_ADVISORY_KEYS)),
  };
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
 * An official posting overrides our status only when the file published one.
 * `final_status` alone does not, because that column is the resolved label
 * and may simply repeat the prediction when no county posting exists.
 */
export function officialPosting(reading: PublishedReading | null | undefined): OfficialPosting | null {
  const posted = reading?.postingStatus?.trim() ?? "";
  if (!posted) return null;
  const label = reading?.finalStatus?.trim() || posted;
  const source = reading?.postingSource?.trim() || null;
  return { label, posted, source };
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

export function officialSummaryLead(posting: OfficialPosting, modelSentence: string, lang: ReadingLang = "en"): string {
  const source = posting.source
    ? lang === "es"
      ? ` Fuente: ${posting.source}.`
      : ` Source: ${posting.source}.`
    : "";
  return lang === "es"
    ? `Aviso oficial: ${posting.label}.${source} Nuestro estimado: ${modelSentence}`
    : `Official posting: ${posting.label}.${source} Our estimate: ${modelSentence}`;
}
