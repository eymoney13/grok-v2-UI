/**
 * Reader-facing labels for a model call, a lab result, and an official posting.
 *
 * This file has no imports so both the status sentences and the posting
 * parser can read it. Do not copy these strings into another module.
 *
 * A model Unsafe call (internal status "Not recommended") is a precaution.
 * The cutoff is set to catch about half of exceedances, so most flagged days
 * do not exceed the beach standard. That call is "Elevated risk".
 * "Over the limit" is only a lab result above the standard.
 * "Closed" and "Warning" are only official postings.
 */

export type ReaderLang = "en" | "es";

export type ModelCall = "Normal" | "Slightly elevated" | "Not recommended";

export interface ModelLabel {
  /** Short chip, legend, and filter. */
  pill: string;
  /** Title and spoken name. */
  title: string;
  /** Fits "Saturday is {phrase}." and "sábado está {phrase}." */
  phrase: string;
}

export const MODEL_LABEL: Record<ReaderLang, Record<ModelCall, ModelLabel>> = {
  en: {
    Normal: {
      pill: "Under limit",
      title: "Under the limit",
      phrase: "under the limit",
    },
    "Slightly elevated": {
      pill: "Near limit",
      title: "Near the limit",
      phrase: "near the limit",
    },
    "Not recommended": {
      pill: "Elevated risk",
      title: "Elevated risk",
      phrase: "an elevated risk",
    },
  },
  es: {
    Normal: {
      pill: "Bajo el límite",
      title: "Bajo el límite",
      phrase: "bajo el límite",
    },
    "Slightly elevated": {
      pill: "Cerca del límite",
      title: "Cerca del límite",
      phrase: "cerca del límite",
    },
    "Not recommended": {
      pill: "Riesgo elevado",
      title: "Riesgo elevado",
      phrase: "en riesgo elevado",
    },
  },
};

/**
 * Longer sentence for a model Unsafe call.
 * It does not say the sample is over the limit, and it is not a posting.
 */
export const MODEL_ELEVATED_DETAIL: Record<ReaderLang, string> = {
  en: "Higher chance of bacteria above the limit. This is a precaution: the cutoff is set to catch about half of exceedances, so most flagged days do not exceed it.",
  es: "Mayor probabilidad de bacterias por encima del límite. Es una precaución: el umbral está puesto para detectar cerca de la mitad de los excesos, así que la mayoría de los días marcados no lo superan.",
};

/** A measured lab result against the beach standard. Not a model call. */
export const LAB_LIMIT_LABEL: Record<ReaderLang, { over: string; under: string; at: string }> = {
  en: {
    over: "Over the limit",
    under: "Under the limit",
    at: "At the limit",
  },
  es: {
    over: "Sobre el límite",
    under: "Bajo el límite",
    at: "En el límite",
  },
};

export type PostingKind = "closure" | "warning" | "advisory";

export interface PostingWords {
  /** Kicker shown ahead of the county’s own words. */
  title: string;
  /** Used when the county did not publish a separate label. */
  label: string;
}

export const POSTING_LABEL: Record<ReaderLang, Record<PostingKind, PostingWords>> = {
  en: {
    closure: { title: "Closed", label: "Closed" },
    warning: { title: "Warning", label: "Warning" },
    advisory: { title: "Advisory", label: "Advisory" },
  },
  es: {
    closure: { title: "Cerrado", label: "Cerrado" },
    warning: { title: "Advertencia", label: "Advertencia" },
    advisory: { title: "Aviso", label: "Aviso" },
  },
};

/**
 * Plain gloss for each model percent band, in `RISK_TIERS` order.
 * These describe the model, not a lab result and not a posting.
 */
export const MODEL_TIER_GLOSS: Record<ReaderLang, readonly [string, string, string, string]> = {
  en: ["Under the limit", "Near the limit", "Elevated risk", "Higher elevated risk"],
  es: ["Bajo el límite", "Cerca del límite", "Riesgo elevado", "Riesgo más elevado"],
};

export function modelDetail(status: ModelCall, lang: ReaderLang, limitMpn: number): string {
  if (status === "Not recommended") return MODEL_ELEVATED_DETAIL[lang];
  if (lang === "es") {
    if (status === "Slightly elevated") {
      return `El modelo estima que el enterococo está más alto, y todavía bajo el estándar de playa de ${limitMpn} MPN/100 mL.`;
    }
    return `El modelo estima que el enterococo está bajo el estándar de playa de ${limitMpn} MPN/100 mL.`;
  }
  if (status === "Slightly elevated") {
    return `The model estimates enterococcus is higher, and still under the ${limitMpn} MPN/100 mL beach standard.`;
  }
  return `The model estimates enterococcus is under the ${limitMpn} MPN/100 mL beach standard.`;
}

/** Coast-wide count of precautionary model flags. Not a count of lab exceedances. */
export function elevatedRiskCount(count: number, lang: ReaderLang): string {
  if (lang === "es") {
    return count === 1 ? "1 playa en riesgo elevado hoy" : `${count} playas en riesgo elevado hoy`;
  }
  return count === 1 ? "1 beach at elevated risk today" : `${count} beaches at elevated risk today`;
}
