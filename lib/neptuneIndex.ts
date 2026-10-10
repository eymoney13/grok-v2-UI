import { hasLimitedLabData } from "./waterStatus.ts";

/**
 * Display helpers for a published Neptune Index.
 *
 * The pipeline publishes `neptune_index` (0–100, higher is cleaner) and
 * `neptune_band`. This module does not turn a probability or a lab result
 * into a score. Band names and cutoffs come from
 * `config/neptune_index_bands.json` when that file is present. They are not
 * constants here. A published band is kept even when it is not in the file.
 */

/** Product scale used when a bands file omits its ends, or when no file is loaded. */
export const PRODUCT_SCALE_MIN = 0;
export const PRODUCT_SCALE_MAX = 100;

export interface IndexBand {
  id: string;
  label: string;
  min: number;
  max: number;
  color: string;
  textColor: string;
  surface: string;
  surfaceText: string;
  guidance: string | null;
  guidanceEs: string | null;
}

export interface IndexScale {
  scaleMin: number;
  scaleMax: number;
  higherIsBetter: boolean;
  bands: IndexBand[];
  /** Roster-tier tables. A missing tier uses `bands`. */
  tiers: Record<string, IndexBand[]>;
}

export interface NeptuneFields {
  index: number | null;
  band: string | null;
}

/** Everything a client needs to draw one beach's index without rereading cutoffs. */
export interface NeptuneDisplay {
  index: number | null;
  bandId: string | null;
  label: string;
  color: string;
  textColor: string;
  surface: string;
  surfaceText: string;
  scaleMin: number;
  scaleMax: number;
  higherIsBetter: boolean;
  guidance: string | null;
  guidanceEs: string | null;
  /** Bands that applied to this beach, in low-to-high order. Empty when the file named none. */
  bands: IndexBand[];
  lowered: boolean;
  /** Set when an old sample has a known age. */
  loweredDays: number | null;
  loweredFallback: boolean;
  /** Old sample with no day count, such as a roster flag and a blank age. */
  loweredNoRecent: boolean;
  /** A warning or closure replaced the band. The statewide count does not use that replacement. */
  forcedByPosting: boolean;
  /** The score's own band is poor. A posting override does not set this. */
  countsAsPoor: boolean;
}

export interface IndexContext {
  tier?: string | null;
  postingStatus?: string | null;
  daysSinceSample?: number | null;
  noRecentSample?: boolean;
  staleAfterDays?: number | null;
  fallbackUsed?: boolean | null;
}

const INDEX_KEYS = ["neptune_index", "neptuneIndex"] as const;
const BAND_KEYS = ["neptune_band", "neptuneBand"] as const;

/** Badge colors. These are not cutoffs. A bands file can replace them. */
const CHROME: Record<string, { color: string; textColor: string; surface: string; surfaceText: string }> = {
  good: { color: "#137333", textColor: "#ffffff", surface: "#e5f4ea", surfaceText: "#0d4d22" },
  caution: { color: "#f6de4a", textColor: "#1c1600", surface: "#fbf6d4", surfaceText: "#3f3500" },
  poor: { color: "#c62828", textColor: "#ffffff", surface: "#fdecea", surfaceText: "#7a1414" },
};

const NEUTRAL = { color: "#5c6570", textColor: "#ffffff", surface: "#eef1f2", surfaceText: "#173a3c" };
const LOWERED_CHROME = { color: "#d5dadd", textColor: "#1c2428", surface: "#e7ecee", surfaceText: "#1c2428" };

const BAND_LABEL_ES: Record<string, string> = {
  good: "Bueno",
  caution: "Precaución",
  poor: "Mala",
};

export const INDEX_PIN_SIZE: [number, number] = [80, 36];

export type Lang = "en" | "es";

function numberOr(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function normalizeBandToken(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return null;
  const text = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!text || /^-?\d+(\.\d+)?$/.test(text)) return null;
  return text;
}

const SMALL_WORDS = new Set(["a", "and", "for", "of", "the", "to"]);

export function titleCaseBand(id: string): string {
  return id
    .split("_")
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function chromeFor(id: string) {
  return CHROME[id] ?? NEUTRAL;
}

function parseBand(raw: unknown, scaleMin: number, scaleMax: number): IndexBand | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = normalizeBandToken(row.id ?? row.band ?? row.name);
  if (!id) return null;
  const min = numberOr(row.min ?? row.minimum, Number.NaN);
  const max = numberOr(row.max ?? row.maximum, Number.NaN);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
  if (max < scaleMin || min > scaleMax) return null;
  const paint = chromeFor(id);
  const color = typeof row.color === "string" && row.color.trim() ? row.color.trim() : paint.color;
  const textColor =
    typeof (row.text_color ?? row.textColor) === "string" && String(row.text_color ?? row.textColor).trim()
      ? String(row.text_color ?? row.textColor).trim()
      : paint.textColor;
  const surface =
    typeof (row.surface ?? row.surface_color) === "string" && String(row.surface ?? row.surface_color).trim()
      ? String(row.surface ?? row.surface_color).trim()
      : paint.surface;
  const surfaceText =
    typeof (row.surface_text ?? row.surfaceText) === "string" && String(row.surface_text ?? row.surfaceText).trim()
      ? String(row.surface_text ?? row.surfaceText).trim()
      : paint.surfaceText;
  const labelRaw = row.label;
  const label = typeof labelRaw === "string" && labelRaw.trim() ? labelRaw.trim() : titleCaseBand(id);
  const guidance = textOrNull(row.guidance ?? row.guidance_en ?? row.guidanceEn);
  const guidanceEs = textOrNull(row.guidance_es ?? row.guidanceEs);
  return { id, label, min, max, color, textColor, surface, surfaceText, guidance, guidanceEs };
}

function textOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text || null;
}

function parseBandList(raw: unknown, scaleMin: number, scaleMax: number): IndexBand[] {
  if (!Array.isArray(raw)) return [];
  const bands = raw
    .map((item) => parseBand(item, scaleMin, scaleMax))
    .filter((band): band is IndexBand => band != null);
  return bands.sort((a, b) => a.min - b.min || a.max - b.max);
}

function parseTiers(raw: unknown, scaleMin: number, scaleMax: number): Record<string, IndexBand[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const tiers: Record<string, IndexBand[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = key.trim().toLowerCase();
    if (!id) continue;
    const list = Array.isArray(value)
      ? value
      : value && typeof value === "object"
        ? (value as Record<string, unknown>).bands
        : null;
    const bands = parseBandList(list, scaleMin, scaleMax);
    if (bands.length > 0) tiers[id] = bands;
  }
  return tiers;
}

/**
 * Read `config/neptune_index_bands.json`. Returns null when the file has no
 * usable band. Scale ends default to 0 and 100 when the file omits them.
 */
export function parseIndexBands(raw: unknown): IndexScale | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const scaleMin = numberOr(data.scale_min ?? data.scaleMin, PRODUCT_SCALE_MIN);
  const scaleMax = numberOr(data.scale_max ?? data.scaleMax, PRODUCT_SCALE_MAX);
  if (!(scaleMax > scaleMin)) return null;
  const higherRaw = data.higher_is_better ?? data.higherIsBetter;
  const higherIsBetter = higherRaw === false || higherRaw === "false" ? false : true;
  const bands = parseBandList(data.bands, scaleMin, scaleMax);
  const tiers = parseTiers(data.tiers ?? data.by_tier ?? data.byTier, scaleMin, scaleMax);
  if (bands.length === 0 && Object.keys(tiers).length === 0) return null;
  return { scaleMin, scaleMax, higherIsBetter, bands, tiers };
}

export function bandsForTier(scale: IndexScale | null, tier: string | null | undefined): IndexBand[] {
  if (!scale) return [];
  const key = tier?.trim().toLowerCase();
  if (key && scale.tiers[key]?.length) return scale.tiers[key];
  return scale.bands;
}

/** Inclusive match. When ranges overlap, the narrowest span wins. */
export function bandForValue(value: number, bands: readonly IndexBand[]): IndexBand | null {
  const matches = bands.filter((band) => value >= band.min && value <= band.max);
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.max - a.min - (b.max - b.min) || a.min - b.min);
  return matches[0] ?? null;
}

function findBand(bands: readonly IndexBand[], token: string | null): IndexBand | null {
  if (!token) return null;
  return bands.find((band) => band.id === token || normalizeBandToken(band.label) === token) ?? null;
}

export function parseNeptuneIndexValue(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const text = typeof raw === "number" ? String(raw) : String(raw).trim();
  if (!text || text.endsWith("%")) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Any band word, including one the bands file does not list. */
export function parseNeptuneBandId(raw: unknown): string | null {
  return normalizeBandToken(raw);
}

export function readNeptuneFields(row: Record<string, unknown> | null | undefined): NeptuneFields {
  if (!row) return { index: null, band: null };
  const indexRaw = INDEX_KEYS.map((key) => row[key]).find((value) => value != null && value !== "");
  const bandRaw = BAND_KEYS.map((key) => row[key]).find((value) => value != null && value !== "");
  return {
    index: parseNeptuneIndexValue(indexRaw),
    band: parseNeptuneBandId(bandRaw),
  };
}

export function mergeNeptuneFields(
  ...parts: Array<NeptuneFields | null | undefined>
): NeptuneFields {
  let index: number | null = null;
  let band: string | null = null;
  for (const part of parts) {
    if (!part) continue;
    if (index == null && part.index != null) index = part.index;
    if (band == null && part.band != null) band = part.band;
  }
  return { index, band };
}

function inScale(value: number, scaleMin: number, scaleMax: number): boolean {
  return Number.isFinite(value) && value >= scaleMin && value <= scaleMax;
}

function poorBand(bands: readonly IndexBand[], scaleMin: number): IndexBand | null {
  const named = bands.find((band) => band.id === "poor");
  if (named) return named;
  return bandForValue(scaleMin, bands);
}

function literalPoor(): Pick<IndexBand, "id" | "label" | "color" | "textColor" | "surface" | "surfaceText" | "guidance" | "guidanceEs"> {
  const paint = chromeFor("poor");
  return { id: "poor", label: "Poor", ...paint, guidance: null, guidanceEs: null };
}

/**
 * A score is shown only from published fields.
 * The band column wins over a cutoff. A number with no band uses the file's
 * inclusive ranges. No file means the number is shown with no invented band.
 * A warning or closure forces Poor, and only when an index is already shown.
 */
export function resolveNeptuneDisplay(
  index: number | null | undefined,
  bandToken: string | null | undefined,
  scale: IndexScale | null,
  context: IndexContext = {}
): NeptuneDisplay | null {
  const scaleMin = scale?.scaleMin ?? PRODUCT_SCALE_MIN;
  const scaleMax = scale?.scaleMax ?? PRODUCT_SCALE_MAX;
  const higherIsBetter = scale?.higherIsBetter ?? true;
  const bands = bandsForTier(scale, context.tier);
  const published = normalizeBandToken(bandToken);
  const numeric = index != null && Number.isFinite(index) && inScale(index, scaleMin, scaleMax) ? index : null;
  const matched = findBand(bands, published);
  const derived = numeric != null ? bandForValue(numeric, bands) : null;

  let bandId: string | null = null;
  let label = "";
  let paint = NEUTRAL;
  let guidance: string | null = null;
  let guidanceEs: string | null = null;
  let countsAsPoor = false;

  if (published) {
    if (matched) {
      bandId = matched.id;
      label = matched.label;
      paint = matched;
      guidance = matched.guidance;
      guidanceEs = matched.guidanceEs;
      countsAsPoor = matched.id === "poor";
    } else {
      bandId = published;
      label = titleCaseBand(published);
      countsAsPoor = published === "poor";
    }
  } else if (derived) {
    bandId = derived.id;
    label = derived.label;
    paint = derived;
    guidance = derived.guidance;
    guidanceEs = derived.guidanceEs;
    countsAsPoor = derived.id === "poor";
  } else if (numeric == null) {
    return null;
  }

  let forcedByPosting = false;
  if (context.postingStatus === "warning" || context.postingStatus === "closure") {
    const poor = poorBand(bands, scaleMin) ?? literalPoor();
    forcedByPosting = bandId !== poor.id;
    bandId = poor.id;
    label = poor.label;
    paint = poor;
    guidance = poor.guidance;
    guidanceEs = poor.guidanceEs;
  }

  const oldSample = hasLimitedLabData(
    context.daysSinceSample ?? null,
    context.noRecentSample === true,
    context.staleAfterDays
  );
  const loweredFallback = context.fallbackUsed === true;
  const loweredDays =
    oldSample && context.daysSinceSample != null && Number.isFinite(context.daysSinceSample)
      ? Math.max(0, Math.round(context.daysSinceSample))
      : null;
  const lowered = oldSample || loweredFallback;

  return {
    index: numeric,
    bandId,
    label,
    color: lowered ? LOWERED_CHROME.color : paint.color,
    textColor: lowered ? LOWERED_CHROME.textColor : paint.textColor,
    surface: lowered ? LOWERED_CHROME.surface : paint.surface,
    surfaceText: lowered ? LOWERED_CHROME.surfaceText : paint.surfaceText,
    scaleMin,
    scaleMax,
    higherIsBetter,
    guidance,
    guidanceEs,
    bands,
    lowered,
    loweredDays,
    loweredFallback,
    loweredNoRecent: oldSample && loweredDays == null,
    forcedByPosting,
    countsAsPoor,
  };
}

export function formatNeptuneIndex(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function displayBandLabel(display: Pick<NeptuneDisplay, "bandId" | "label">, lang: Lang): string {
  if (!display.label && !display.bandId) return "";
  if (lang === "es" && display.bandId && BAND_LABEL_ES[display.bandId]) return BAND_LABEL_ES[display.bandId];
  return display.label;
}

export function indexScalePhrase(display: Pick<NeptuneDisplay, "index" | "scaleMax" | "higherIsBetter">, lang: Lang): string | null {
  if (display.index == null) return null;
  const number = formatNeptuneIndex(display.index);
  if (!display.higherIsBetter) return `${number} / ${display.scaleMax}`;
  return lang === "es"
    ? `${number} / ${display.scaleMax}, más alto es más limpio`
    : `${number} / ${display.scaleMax}, higher is cleaner`;
}

export function indexConfidenceNote(
  display: Pick<NeptuneDisplay, "lowered" | "loweredDays" | "loweredFallback" | "loweredNoRecent">,
  lang: Lang
): string | null {
  if (!display.lowered) return null;
  const parts: string[] = [];
  if (display.loweredDays != null) {
    const n = display.loweredDays;
    if (lang === "es") {
      parts.push(n === 1
        ? "Menor confianza: última prueba de laboratorio hace 1 día"
        : `Menor confianza: última prueba de laboratorio hace ${n} días`);
    } else {
      parts.push(n === 1
        ? "Lower confidence: last lab test 1 day ago"
        : `Lower confidence: last lab test ${n} days ago`);
    }
  } else if (display.loweredNoRecent) {
    parts.push(lang === "es"
      ? "Menor confianza: no hay una prueba de laboratorio reciente"
      : "Lower confidence: no recent lab test");
  }
  if (display.loweredFallback) {
    parts.push(lang === "es"
      ? "Menor confianza: este estimado usó un respaldo."
      : "Lower confidence: this estimate used a fallback.");
  }
  return parts.join(" ") || null;
}

export function neptuneIndexName(display: NeptuneDisplay, lang: Lang = "en"): string {
  const phrase = indexScalePhrase(display, lang);
  const label = displayBandLabel(display, lang);
  const note = indexConfidenceNote(display, lang);
  return ["Neptune Index", phrase, label, note].filter((part) => !!part).join(", ");
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

/** Leaflet pin. The number and the band word are both in the marker. */
export function indexPinHtml(display: NeptuneDisplay): string {
  const value =
    display.index == null
      ? ""
      : `<span class="nb-index-value">${escapeHtml(formatNeptuneIndex(display.index))}</span>`;
  const band = display.label
    ? `<span class="nb-index-band">${escapeHtml(display.label)}</span>`
    : "";
  const lowered = display.lowered ? " nb-overview-dot--lowered" : "";
  return `<div class="nb-overview-dot nb-overview-dot--index${lowered}" style="background:${display.color};color:${display.textColor}">${value}${band}</div>`;
}

/** Share of the bar, normalized so the segments fill it. Low scores sit on the left. */
export function bandWidths(bands: readonly IndexBand[]): number[] {
  const ordered = [...bands].sort((a, b) => a.min - b.min || a.max - b.max);
  const spans = ordered.map((band) => Math.max(band.max - band.min, 0));
  const total = spans.reduce((sum, span) => sum + span, 0);
  if (total <= 0) return ordered.map(() => 1 / Math.max(ordered.length, 1));
  return spans.map((span) => span / total);
}
