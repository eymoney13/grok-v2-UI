import { NEPTUNE_INDEX, type NeptuneBand } from "../config/neptune-index.ts";

/**
 * Display helpers for a published Neptune Index. Nothing here derives a score
 * from probability, MPN, or the Under / Near / Over status.
 */
export interface NeptuneScore {
  /** Null when the file named a band and did not publish a number. */
  index: number | null;
  band: NeptuneBand;
}

const INDEX_KEYS = ["neptune_index", "neptuneIndex"] as const;
const BAND_KEYS = ["neptune_band", "neptuneBand"] as const;

export const INDEX_PIN_SIZE: [number, number] = [80, 36];

export function bandById(id: string | null | undefined): NeptuneBand | null {
  if (!id) return null;
  return NEPTUNE_INDEX.bands.find((band) => band.id === id) ?? null;
}

/** Which configured band a published score falls in. Null outside the scale. */
export function bandForValue(value: number): NeptuneBand | null {
  if (!Number.isFinite(value) || value < NEPTUNE_INDEX.scaleMin || value > NEPTUNE_INDEX.scaleMax) {
    return null;
  }
  const bands = NEPTUNE_INDEX.bands;
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const next = bands[i + 1];
    if (next) {
      if (value >= band.min && value < next.min) return band;
    } else if (value >= band.min && value <= band.max) {
      return band;
    }
  }
  return null;
}

export function parseNeptuneIndexValue(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const text = typeof raw === "number" ? String(raw) : String(raw).trim();
  if (!text || text.endsWith("%")) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  if (n < NEPTUNE_INDEX.scaleMin || n > NEPTUNE_INDEX.scaleMax) return null;
  return n;
}

export function parseNeptuneBandId(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return null;
  const text = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!text || /^-?\d+(\.\d+)?$/.test(text)) return null;
  const band = NEPTUNE_INDEX.bands.find((item) => {
    const label = item.label.toLowerCase().replace(/[\s-]+/g, "_");
    return item.id === text || label === text;
  });
  return band?.id ?? null;
}

export function readNeptuneFields(row: Record<string, unknown> | null | undefined): {
  index: number | null;
  band: string | null;
} {
  if (!row) return { index: null, band: null };
  const indexRaw = INDEX_KEYS.map((key) => row[key]).find((value) => value != null && value !== "");
  const bandRaw = BAND_KEYS.map((key) => row[key]).find((value) => value != null && value !== "");
  return {
    index: parseNeptuneIndexValue(indexRaw),
    band: parseNeptuneBandId(bandRaw),
  };
}

/**
 * A score is shown only from published fields.
 * A number in range picks the band from the cutoffs, so the words match the
 * number. A band with no number is shown without a value. Anything else is
 * absent, and the caller keeps Under / Near / Over.
 */
export function publishedNeptuneScore(
  index: number | null | undefined,
  bandId: string | null | undefined
): NeptuneScore | null {
  if (index != null && Number.isFinite(index)) {
    const fromScale = bandForValue(index);
    if (fromScale) return { index, band: fromScale };
  }
  const band = bandById(bandId);
  return band ? { index: null, band } : null;
}

export function mergeNeptuneFields(
  ...parts: Array<{ index: number | null; band: string | null } | null | undefined>
): { index: number | null; band: string | null } {
  let index: number | null = null;
  let band: string | null = null;
  for (const part of parts) {
    if (!part) continue;
    if (index == null && part.index != null) index = part.index;
    if (band == null && part.band != null) band = part.band;
  }
  return { index, band };
}

export function formatNeptuneIndex(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function neptuneIndexName(score: NeptuneScore): string {
  const number = score.index == null ? "" : `${formatNeptuneIndex(score.index)} of ${NEPTUNE_INDEX.scaleMax}, `;
  return `Neptune Index ${number}${score.band.label}, level ${score.band.level} of ${NEPTUNE_INDEX.bands.length}`;
}

/** Share of the 0–500 bar this band occupies. */
export function bandWidth(band: NeptuneBand): number {
  const bands = NEPTUNE_INDEX.bands;
  const index = bands.findIndex((item) => item.id === band.id);
  const next = bands[index + 1];
  const span = next ? next.min - band.min : band.max - band.min + 1;
  const total = NEPTUNE_INDEX.scaleMax - NEPTUNE_INDEX.scaleMin + 1;
  return span / total;
}

export function limitBand(): NeptuneBand | null {
  return bandById(NEPTUNE_INDEX.limitBandId);
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
export function indexPinHtml(score: NeptuneScore): string {
  const value =
    score.index == null
      ? ""
      : `<span class="nb-index-value">${escapeHtml(formatNeptuneIndex(score.index))}</span>`;
  return `<div class="nb-overview-dot nb-overview-dot--index" style="background:${score.band.color};color:${score.band.textColor}">${value}<span class="nb-index-band">${escapeHtml(score.band.pin)}</span></div>`;
}
