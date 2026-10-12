import type { EstimateMethod } from "./publishedReading.ts";
import { methodWords } from "./publishedReading.ts";
import { LAB_LIMIT_LABEL } from "./readerLabels.ts";
import { hasLimitedLabData } from "./waterStatus.ts";

/**
 * Neptune Index display.
 *
 * One scale for every beach. A lower number is cleaner. Band names and the
 * formula live in `config/neptune_index_bands.json`. A published `neptune_index`
 * is used when it already matches that formula. When it is missing, or the
 * file is still the older scale, only a well-tested beach may be computed
 * from probability. A limited-data beach stays “Forecast pending” with no number.
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
  /** Unsafe side of the scale. A posting override does not change this on the score's own band. */
  countsAsUnsafe: boolean;
}

/** How to turn a probability into an index. Modeling replaces this object in the bands file. */
export interface IndexFormula {
  id: string;
  /** Column family. `calibrated_probability` or `probability`. */
  input: string;
  fallbackInput: string | null;
  multiply: number;
  round: "nearest" | "floor" | "none";
}

/** When the published `neptune_index` already follows `formula`, trust that column. */
export interface PublishedScaleDetection {
  tolerance: number;
  minimumRows: number;
  minimumFraction: number;
}

export interface IndexScale {
  scaleMin: number;
  scaleMax: number;
  higherIsBetter: boolean;
  bands: IndexBand[];
  /** Older files may still name tier tables. The live scale does not use them. */
  tiers: Record<string, IndexBand[]>;
  formula: IndexFormula | null;
  detection: PublishedScaleDetection;
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
  /** The score's own band is on the unsafe side of the scale. A posting or lab override does not set this. */
  countsAsPoor: boolean;
  /** A lab result above the beach standard. The chip says Over the limit instead of the model band. */
  labOverride: boolean;
  /**
   * A rules row published a score and no band. The number stays uncolored.
   * The page uses the lab-test and rain note beside it.
   */
  rulesIndex: boolean;
}

export interface IndexContext {
  tier?: string | null;
  method?: EstimateMethod | null;
  postingStatus?: string | null;
  daysSinceSample?: number | null;
  noRecentSample?: boolean;
  staleAfterDays?: number | null;
  fallbackUsed?: boolean | null;
  /** Last lab result was above the beach standard. */
  labOverLimit?: boolean;
}

const INDEX_KEYS = ["neptune_index", "neptuneIndex"] as const;
const BAND_KEYS = ["neptune_band", "neptuneBand"] as const;

/** Badge colors. These are not cutoffs. A bands file can replace them. */
const CHROME: Record<string, { color: string; textColor: string; surface: string; surfaceText: string }> = {
  good: { color: "#0c4f28", textColor: "#ffffff", surface: "#e5f4ea", surfaceText: "#0c4f28" },
  moderate: { color: "#5c3b00", textColor: "#ffffff", surface: "#f8efd4", surfaceText: "#3a2500" },
  caution: { color: "#f6de4a", textColor: "#1c1600", surface: "#fbf6d4", surfaceText: "#3f3500" },
  likely_unsafe: { color: "#7a2208", textColor: "#ffffff", surface: "#fde8d8", surfaceText: "#6a2c08" },
  very_likely_unsafe: { color: "#6b1010", textColor: "#ffffff", surface: "#f8d6d6", surfaceText: "#5c1010" },
  poor: { color: "#8e1b1b", textColor: "#ffffff", surface: "#fdecea", surfaceText: "#6b1010" },
};

const NEUTRAL = { color: "#5c6570", textColor: "#ffffff", surface: "#eef1f2", surfaceText: "#173a3c" };
const LOWERED_CHROME = { color: "#d5dadd", textColor: "#1c2428", surface: "#e7ecee", surfaceText: "#1c2428" };

const BAND_LABEL_ES: Record<string, string> = {
  good: "Bueno",
  moderate: "Moderado",
  caution: "Precaución",
  likely_unsafe: "Probablemente inseguro",
  very_likely_unsafe: "Muy probablemente inseguro",
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

function bandEndpoint(row: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (row[key] == null || row[key] === "") continue;
    return numberOr(row[key], Number.NaN);
  }
  return Number.NaN;
}

function parseBand(raw: unknown, scaleMin: number, scaleMax: number, higherIsBetter: boolean): IndexBand | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = normalizeBandToken(row.id ?? row.band ?? row.name);
  if (!id) return null;
  const min = bandEndpoint(row, ["min", "minimum", "min_index", "minIndex"]);
  const max = bandEndpoint(row, ["max", "maximum", "max_index", "maxIndex"]);
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
  const explicitUnsafe = row.counts_as_unsafe ?? row.countsAsUnsafe;
  const midpoint = (scaleMin + scaleMax) / 2;
  const impliedUnsafe = higherIsBetter ? max <= midpoint : min >= midpoint;
  const countsAsUnsafe =
    explicitUnsafe === true || explicitUnsafe === "true"
      ? true
      : explicitUnsafe === false || explicitUnsafe === "false"
        ? false
        : impliedUnsafe;
  return { id, label, min, max, color, textColor, surface, surfaceText, guidance, guidanceEs, countsAsUnsafe };
}

function textOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text || null;
}

function parseBandList(raw: unknown, scaleMin: number, scaleMax: number, higherIsBetter: boolean): IndexBand[] {
  if (!Array.isArray(raw)) return [];
  const drafts = raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const min = bandEndpoint(row, ["min", "minimum", "min_index", "minIndex"]);
      const explicitMax = bandEndpoint(row, ["max", "maximum", "max_index", "maxIndex"]);
      if (!Number.isFinite(min)) return null;
      return { row, min, max: Number.isFinite(explicitMax) ? explicitMax : null };
    })
    .filter((item): item is { row: Record<string, unknown>; min: number; max: number | null } => item != null)
    .sort((a, b) => a.min - b.min);
  const closed = drafts.map((draft, index) => {
    if (draft.max != null) return draft;
    const next = drafts[index + 1];
    const max = next ? Math.max(draft.min, next.min - 1) : scaleMax;
    return { ...draft, row: { ...draft.row, min: draft.min, max } };
  });
  const bands = closed
    .map((draft) => parseBand(draft.row, scaleMin, scaleMax, higherIsBetter))
    .filter((band): band is IndexBand => band != null);
  return bands.sort((a, b) => a.min - b.min || a.max - b.max);
}

function parseTiers(raw: unknown, scaleMin: number, scaleMax: number, higherIsBetter: boolean): Record<string, IndexBand[]> {
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
    const bands = parseBandList(list, scaleMin, scaleMax, higherIsBetter);
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
  const shared = data.bands ?? (Array.isArray(data.default) ? data.default : null);
  const bands = parseBandList(shared, scaleMin, scaleMax, higherIsBetter);
  const tiers = parseTiers(data.tiers ?? data.by_tier ?? data.byTier, scaleMin, scaleMax, higherIsBetter);
  if (bands.length === 0 && Object.keys(tiers).length === 0) return null;
  return {
    scaleMin,
    scaleMax,
    higherIsBetter,
    bands,
    tiers,
    formula: parseFormula(data.formula),
    detection: parseDetection(data.published_index_scale ?? data.publishedIndexScale),
  };
}

export const DEFAULT_DETECTION: PublishedScaleDetection = {
  tolerance: 1,
  minimumRows: 20,
  minimumFraction: 0.8,
};

function parseFormula(raw: unknown): IndexFormula | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const multiply = numberOr(row.multiply, Number.NaN);
  if (!Number.isFinite(multiply)) return null;
  const input = typeof row.input === "string" && row.input.trim() ? row.input.trim() : "calibrated_probability";
  const fallbackRaw = row.fallback_input ?? row.fallbackInput;
  const fallbackInput = typeof fallbackRaw === "string" && fallbackRaw.trim() ? fallbackRaw.trim() : null;
  const round = row.round === "floor" || row.round === "none" ? row.round : "nearest";
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : "probability_times_scale";
  return { id, input, fallbackInput, multiply, round };
}

function parseDetection(raw: unknown): PublishedScaleDetection {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_DETECTION };
  const row = raw as Record<string, unknown>;
  const fraction = numberOr(row.minimum_fraction ?? row.minimumFraction, DEFAULT_DETECTION.minimumFraction);
  return {
    tolerance: numberOr(row.tolerance, DEFAULT_DETECTION.tolerance),
    minimumRows: numberOr(row.minimum_rows ?? row.minimumRows, DEFAULT_DETECTION.minimumRows),
    minimumFraction: fraction > 0 && fraction <= 1 ? fraction : DEFAULT_DETECTION.minimumFraction,
  };
}

/**
 * `round(multiply × probability)` from the configured inputs.
 * The first finite input wins. Calibrated probability is the live formula's first input.
 */
export function scoreFromProbability(
  values: Record<string, number | null | undefined>,
  formula: IndexFormula
): number | null {
  const primary = values[formula.input];
  const fallback = formula.fallbackInput ? values[formula.fallbackInput] : null;
  const value =
    primary != null && Number.isFinite(primary)
      ? primary
      : fallback != null && Number.isFinite(fallback)
        ? fallback
        : null;
  if (value == null) return null;
  const scaled = value * formula.multiply;
  if (!Number.isFinite(scaled)) return null;
  if (formula.round === "floor") return Math.floor(scaled);
  if (formula.round === "none") return scaled;
  return Math.round(scaled);
}

/**
 * `published` when the column already matches the formula on enough rows.
 * Otherwise the file is still the older scale and the formula is used.
 */
export function detectPublishedScale(
  pairs: readonly { published: number; computed: number }[],
  detection: PublishedScaleDetection
): "published" | "formula" {
  if (pairs.length < detection.minimumRows) return "formula";
  const hits = pairs.filter((pair) => Math.abs(pair.published - pair.computed) <= detection.tolerance).length;
  return hits / pairs.length >= detection.minimumFraction ? "published" : "formula";
}

export type PublishedIndexMode = "published" | "formula";

/** `published` when the column already matches the formula. Otherwise compute it. */
export function indexScaleMode(
  rows: readonly { published: number | null; calibrated: number | null; probability: number | null }[],
  scale: IndexScale | null
): PublishedIndexMode {
  if (!scale?.formula) return "published";
  const pairs: { published: number; computed: number }[] = [];
  for (const row of rows) {
    if (row.published == null || !Number.isFinite(row.published)) continue;
    const computed = scoreFromProbability(
      { calibrated_probability: row.calibrated, probability: row.probability },
      scale.formula
    );
    if (computed == null) continue;
    pairs.push({ published: row.published, computed });
  }
  return detectPublishedScale(pairs, scale.detection);
}

/** Roster tiers that may use a computed index when `neptune_index` is not trusted. */
export function isWellTestedTier(tier: string | null | undefined): boolean {
  const key = (tier ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return key === "model_pool" || key === "well_tested";
}

/**
 * Use the published index only when the file is already on this scale.
 * A blank cell, or a file still on the old scale, is fallback mode.
 * Fallback computes a score only for a well-tested beach. Limited-data
 * probability is raw and can be 1.0, so those rows get no number.
 */
export function chooseIndexValue(
  published: { index: number | null; band: string | null } | null | undefined,
  probabilities: { calibrated: number | null; probability: number | null },
  scale: IndexScale | null,
  mode: PublishedIndexMode,
  tier?: string | null
): { index: number | null; band: string | null; forecastPending: boolean } {
  const publishedIndex = published?.index ?? null;
  if (mode === "published" && publishedIndex != null) {
    return { index: publishedIndex, band: published?.band ?? null, forecastPending: false };
  }
  if (!isWellTestedTier(tier)) {
    return { index: null, band: null, forecastPending: true };
  }
  const computed = scale?.formula
    ? scoreFromProbability(
        { calibrated_probability: probabilities.calibrated, probability: probabilities.probability },
        scale.formula
      )
    : null;
  return { index: computed, band: null, forecastPending: false };
}

/** The one scale. A tier table is used only when the file has no shared list. */
export function bandsForTier(scale: IndexScale | null, tier: string | null | undefined): IndexBand[] {
  if (!scale) return [];
  if (scale.bands.length > 0) return scale.bands;
  const key = tier?.trim().toLowerCase();
  if (key && scale.tiers[key]?.length) return scale.tiers[key];
  return [];
}

export function tierScaleTitle(tier: string): string {
  if (tier === "model_pool") return "In the model pool";
  if (tier === "limited_data") return "Limited data";
  return titleCaseBand(tier);
}

/** Every band table in the file, in roster-tier order. The length of each list is the file's. */
export function scaleGroups(scale: IndexScale | null): { key: string; title: string; bands: IndexBand[] }[] {
  if (!scale) return [];
  if (scale.bands.length > 0) {
    return [{ key: "scale", title: "Neptune Index", bands: scale.bands }];
  }
  const preferred = ["model_pool", "limited_data"];
  const keys = Object.keys(scale.tiers).sort((a, b) => {
    const ia = preferred.indexOf(a);
    const ib = preferred.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  const groups: { key: string; title: string; bands: IndexBand[] }[] = [];
  for (const key of keys) {
    groups.push({ key, title: tierScaleTitle(key), bands: scale.tiers[key] ?? [] });
  }
  return groups;
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

function worstShownBand(
  bands: readonly IndexBand[],
  scaleMin: number,
  higherIsBetter: boolean
): Pick<IndexBand, "id" | "label" | "color" | "textColor" | "surface" | "surfaceText" | "guidance" | "guidanceEs"> {
  if (!higherIsBetter && bands.length > 0) {
    return [...bands].sort((a, b) => b.max - a.max || b.min - a.min)[0];
  }
  if (!higherIsBetter) {
    const paint = chromeFor("very_likely_unsafe");
    return { id: "very_likely_unsafe", label: "Very Likely Unsafe", ...paint, guidance: null, guidanceEs: null };
  }
  return poorBand(bands, scaleMin) ?? literalPoor();
}

function literalPoor(): Pick<IndexBand, "id" | "label" | "color" | "textColor" | "surface" | "surfaceText" | "guidance" | "guidanceEs"> {
  const paint = chromeFor("poor");
  return { id: "poor", label: "Poor", ...paint, guidance: null, guidanceEs: null };
}

/**
 * One scale for every beach that has a number, including a rules row.
 * A published band word that the table also lists does not override the cutoff.
 * A word the table does not list is kept. No file means the number is shown
 * with no invented band. A warning or closure moves a shown band to the
 * unsafe end of the scale. It does not paint a band onto a number that has none.
 * A lab result over the limit does not rename the band; the chip says Over the limit.
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
  const tierBands = bandsForTier(scale, context.tier);
  const rulesRow = context.method === "rules";
  const published = normalizeBandToken(bandToken);
  const numeric = index != null && Number.isFinite(index) && inScale(index, scaleMin, scaleMax) ? index : null;
  const matched = findBand(tierBands, published);
  const derived = numeric != null ? bandForValue(numeric, tierBands) : null;

  let bandId: string | null = null;
  let label = "";
  let paint = NEUTRAL;
  let guidance: string | null = null;
  let guidanceEs: string | null = null;
  let countsAsPoor = false;

  const listedPublished = published != null && matched != null;
  if (derived && (!published || listedPublished)) {
    bandId = derived.id;
    label = derived.label;
    paint = derived;
    guidance = derived.guidance;
    guidanceEs = derived.guidanceEs;
    countsAsPoor = derived.countsAsUnsafe;
  } else if (published) {
    if (matched) {
      bandId = matched.id;
      label = matched.label;
      paint = matched;
      guidance = matched.guidance;
      guidanceEs = matched.guidanceEs;
      countsAsPoor = matched.countsAsUnsafe;
    } else {
      bandId = published;
      label = titleCaseBand(published);
      countsAsPoor = published === "poor" || published === "likely_unsafe" || published === "very_likely_unsafe";
    }
  } else if (numeric == null) {
    return null;
  }

  let forcedByPosting = false;
  if (bandId && (context.postingStatus === "warning" || context.postingStatus === "closure")) {
    const worst = worstShownBand(tierBands, scaleMin, higherIsBetter);
    forcedByPosting = bandId !== worst.id;
    bandId = worst.id;
    label = worst.label;
    paint = worst;
    guidance = worst.guidance;
    guidanceEs = worst.guidanceEs;
  }
  const rulesIndex = rulesRow && numeric != null && bandId == null;
  const bands = tierBands;

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
    labOverride: context.labOverLimit === true,
    rulesIndex,
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
  if (!display.higherIsBetter) {
    return lang === "es"
      ? `${number} / ${display.scaleMax}, más bajo es más limpio`
      : `${number} / ${display.scaleMax}, lower is cleaner`;
  }
  return lang === "es"
    ? `${number} / ${display.scaleMax}, más alto es más limpio`
    : `${number} / ${display.scaleMax}, higher is cleaner`;
}

/** Plain words next to the band. The same three phrases cover every beach. */
export function swimWords(bandId: string | null | undefined, lang: Lang): string | null {
  if (bandId === "good") return lang === "es" ? "Seguro para nadar" : "Safe to swim";
  if (bandId === "moderate") return lang === "es" ? "Tenga precaución" : "Use caution";
  if (bandId === "likely_unsafe" || bandId === "very_likely_unsafe") return lang === "es" ? "No es seguro" : "Not safe";
  return null;
}

/** Short reason under the answer. No formula jargon. */
export function indexWhy(display: NeptuneDisplay, lang: Lang): string {
  const number = display.index == null ? null : formatNeptuneIndex(display.index);
  if (display.labOverride) {
    return lang === "es"
      ? "Una prueba de laboratorio superó el límite. Eso va por delante del índice."
      : "A lab test was over the limit. That comes ahead of the index.";
  }
  if (display.forcedByPosting) {
    const lead = lang === "es"
      ? "El condado publicó un aviso. Eso va por delante del índice."
      : "The county posted a warning or closure. That comes ahead of the index.";
    if (number == null) return lead;
    return lang === "es"
      ? `${lead} El índice es ${number} de ${display.scaleMax}. Un número más bajo es agua más limpia.`
      : `${lead} The index is ${number} out of ${display.scaleMax}. A lower number is cleaner water.`;
  }
  if (number == null) {
    return lang === "es"
      ? "Un número más bajo es agua más limpia. 50 es cerca de un 50% de probabilidad de superar el límite."
      : "A lower number is cleaner water. 50 means about a 50% chance the water is over the limit.";
  }
  return lang === "es"
    ? `El índice es ${number} de ${display.scaleMax}. Un número más bajo es agua más limpia. 50 es cerca de un 50% de probabilidad de superar el límite.`
    : `The index is ${number} out of ${display.scaleMax}. A lower number is cleaner water. 50 means about a 50% chance the water is over the limit.`;
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

export interface IndexReading {
  /** Safe to swim, Use caution, or Not safe. Null when this band has no plain phrase. */
  plain: string | null;
  /** Band name. A lab exceedance says Over the limit instead. */
  label: string | null;
  /** The score, secondary to the band. */
  phrase: string | null;
  /** Lab-test and rain note for a rules score that has no band. */
  rules: string | null;
  note: string | null;
}

/** Plain words, then the band, then the number. A lab exceedance keeps its own words. */
export function indexReading(display: NeptuneDisplay, lang: Lang): IndexReading {
  const overLimit = display.labOverride ? LAB_LIMIT_LABEL[lang].over : null;
  return {
    plain: overLimit ?? swimWords(display.bandId, lang),
    label: overLimit ?? (display.bandId ? displayBandLabel(display, lang) : null),
    phrase: indexScalePhrase(display, lang),
    rules: display.rulesIndex ? methodWords("rules", lang) : null,
    note: indexConfidenceNote(display, lang),
  };
}

export function indexLead(display: NeptuneDisplay, lang: Lang = "en"): string {
  const reading = indexReading(display, lang);
  const head = [reading.label, reading.phrase].filter((part) => !!part).join(", ");
  return [head, reading.rules, reading.note].filter((part) => !!part).join(" ");
}

export function neptuneIndexName(display: NeptuneDisplay, lang: Lang = "en"): string {
  const lead = indexLead(display, lang);
  return lead ? `Neptune Index, ${lead}` : "Neptune Index";
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

/** Leaflet pin. The band name leads. A score with no band is the number on a neutral pin. */
export function indexPinHtml(display: NeptuneDisplay): string {
  const value =
    display.index == null
      ? ""
      : `<span class="nb-index-value">${escapeHtml(formatNeptuneIndex(display.index))}</span>`;
  if (!display.bandId) {
    return `<div class="nb-overview-dot nb-overview-dot--index nb-overview-dot--number" style="background:#eef1f2;color:#173a3c">${value}</div>`;
  }
  const band = display.label
    ? `<span class="nb-index-band">${escapeHtml(display.label)}</span>`
    : "";
  const lowered = display.lowered ? " nb-overview-dot--lowered" : "";
  return `<div class="nb-overview-dot nb-overview-dot--index${lowered}" style="background:${display.color};color:${display.textColor}">${band}${value}</div>`;
}

/** Share of the bar, normalized so the segments fill it. Low scores sit on the left. */
export function bandWidths(bands: readonly IndexBand[]): number[] {
  const ordered = [...bands].sort((a, b) => a.min - b.min || a.max - b.max);
  const spans = ordered.map((band) => Math.max(band.max - band.min, 0));
  const total = spans.reduce((sum, span) => sum + span, 0);
  if (total <= 0) return ordered.map(() => 1 / Math.max(ordered.length, 1));
  return spans.map((span) => span / total);
}
