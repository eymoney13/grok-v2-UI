/**
 * Pure parsers for project-neptune-v2 outputs.
 *
 * File names and column aliases live here so a rename is a one-file change.
 * Nothing in this module reads the filesystem or invents a measurement.
 */

import { readNeptuneFields } from "./neptuneIndex.ts";
import { EMPTY_READING, parsePublishedReading, type PublishedReading } from "./publishedReading.ts";

export type RosterTier = "model_pool" | "limited_data";

export interface RosterStation {
  stationCode: string;
  name: string;
  lat: number | null;
  lon: number | null;
  county: string | null;
  lastSampleDate: string | null;
  samplingFrequency: string | null;
  tier: RosterTier | null;
}

export interface ArchiveRow {
  stationCode: string;
  forecastDate: string | null;
  targetDate: string | null;
  leadDays: number | null;
  /** Exceedance probability as a fraction from 0 to 1. */
  probability: number | null;
  call: string | null;
  /** Decision threshold as a fraction from 0 to 1. */
  threshold: number | null;
  publishTimestampUtc: string | null;
  modelVersion: string | null;
  lastSampleDate: string | null;
  lastSampleAgeDays: number | null;
  fallbackUsed: boolean | null;
  generatedAt: string | null;
  calibratedProbability: number | null;
  /** Non-numeric pipeline note only. A bare number is not treated as confidence. */
  confidenceFlag: string | null;
  /** Method, confidence level, and official posting. All null when the columns are absent. */
  reading: PublishedReading;
  /** Published 0–500 score. Null when the column is absent or out of range. */
  neptuneIndex: number | null;
  /** Published band id from the display config. Null when absent or unknown. */
  neptuneBand: string | null;
}

export interface StationArchive {
  nowcast: ArchiveRow | null;
  forecast: ArchiveRow[];
  modelVersion: string | null;
  publishTimestampUtc: string | null;
  fallbackUsed: boolean | null;
  lastSampleDate: string | null;
  lastSampleAgeDays: number | null;
  calibratedProbability: number | null;
  confidenceFlag: string | null;
  /** Lead 0 when that row exists, otherwise the row the archive fell back to. */
  reading: PublishedReading;
  generatedAt: string | null;
}

export interface StalenessTable {
  defaultDays: number | null;
  byCounty: Record<string, number>;
}

export interface RegionDef {
  name: string;
  counties: string[];
}

export interface RegionConfig {
  rosterPath: string | null;
  regions: RegionDef[];
}

export interface RunManifest {
  generatedAt: string | null;
  modelVersion: string | null;
  staleCounties: string[];
  checksPassed: boolean | null;
}

export interface OptionalModelFields {
  calibratedProbability: number | null;
  confidenceFlag: string | null;
  generatedAt: string | null;
  reading: PublishedReading;
}

const CALIBRATED_KEYS = [
  "calibrated_probability",
  "calibrated_exc_probability",
  "p_calibrated",
  "calibratedProbability",
];
const CONFIDENCE_FLAG_KEYS = ["confidence_flag", "confidenceFlag", "model_confidence", "beach_confidence"];
const CONFIDENCE_TEXT_KEYS = ["confidence", "confidence_level", "confidenceLevel"];
const GENERATED_KEYS = ["generated_at", "generatedAt"];

function isObj(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function stationCode(raw: unknown): string | null {
  if (raw == null) return null;
  const key = String(raw).trim();
  return key === "" ? null : key;
}

export function normalizeCounty(raw: unknown): string | null {
  if (raw == null) return null;
  const text = String(raw).trim().replace(/\s+county$/i, "").trim();
  return text === "" ? null : text;
}

export function countyKey(raw: unknown): string | null {
  const name = normalizeCounty(raw);
  return name ? name.toLowerCase() : null;
}

/** Fractions stay fractions. Numbers above 1 and at most 100 are percents. */
export function asFraction(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const text = (typeof raw === "number" ? String(raw) : String(raw).trim()).replace(/%$/, "");
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

export function asNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

export function asBool(raw: unknown): boolean | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "boolean") return raw;
  const text = String(raw).trim().toLowerCase();
  if (text === "true" || text === "1" || text === "yes" || text === "y") return true;
  if (text === "false" || text === "0" || text === "no" || text === "n") return false;
  return null;
}

export function asTier(raw: unknown): RosterTier | null {
  const text = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (text === "model_pool" || text === "in_model_pool") return "model_pool";
  if (text === "limited_data" || text === "limited") return "limited_data";
  return null;
}

export function asDateString(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const text = String(raw).trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

export function asTimestamp(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
  const text = String(raw).trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
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

/**
 * A numeric "confidence" is stored nowhere we would print it. The column
 * names are still unsettled, and a percent here would read as a guarantee.
 */
export function textFlag(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?%?$/.test(text)) return null;
  return text;
}

export function optionalModelFields(row: Record<string, unknown> | null | undefined): OptionalModelFields {
  if (!row) {
    return { calibratedProbability: null, confidenceFlag: null, generatedAt: null, reading: { ...EMPTY_READING } };
  }
  const reading = parsePublishedReading(row);
  // `confidence: high` is the level. Any other non-numeric word in that column
  // stays a pipeline note, and a number is dropped so it cannot read as a percent.
  const namedFlag = textFlag(first(row, CONFIDENCE_FLAG_KEYS));
  const looseFlag = reading.confidence ? null : textFlag(first(row, CONFIDENCE_TEXT_KEYS));
  return {
    calibratedProbability: asFraction(first(row, CALIBRATED_KEYS)),
    confidenceFlag: namedFlag ?? looseFlag,
    generatedAt: asTimestamp(first(row, GENERATED_KEYS)),
    reading,
  };
}

export function parseRosterRecord(row: Record<string, unknown>): RosterStation | null {
  const code = stationCode(first(row, ["station_code", "stationCode", "StationCode", "code", "primary_station"]));
  if (!code) return null;
  const name = textOrNull(first(row, ["name", "station_name", "StationName", "beach_name", "beach"])) ?? code;
  return {
    stationCode: code,
    name,
    lat: asNumber(first(row, ["lat", "latitude", "Latitude"])),
    lon: asNumber(first(row, ["lon", "lng", "longitude", "Longitude"])),
    county: normalizeCounty(first(row, ["county", "County"])),
    lastSampleDate: asDateString(first(row, ["last_sample_date", "lastSampleDate"])),
    samplingFrequency: textOrNull(first(row, ["sampling_frequency", "samplingFrequency"])),
    tier: asTier(first(row, ["tier", "Tier"])),
  };
}

function rowsFromJson(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isObj);
  if (!isObj(data)) return [];
  for (const key of ["stations", "beaches", "roster", "records"]) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(isObj);
  }
  return [];
}

export function parseRosterJson(data: unknown): RosterStation[] {
  return rowsFromJson(data)
    .map(parseRosterRecord)
    .filter((row): row is RosterStation => row != null);
}

export function parseRosterRows(rows: Record<string, unknown>[]): RosterStation[] {
  return rows.map(parseRosterRecord).filter((row): row is RosterStation => row != null);
}

export function parseArchiveRow(row: Record<string, unknown>): ArchiveRow | null {
  const code = stationCode(first(row, ["station_code", "stationCode", "StationCode", "station"]));
  if (!code) return null;
  const extra = optionalModelFields(row);
  const indexFields = readNeptuneFields(row);
  return {
    stationCode: code,
    forecastDate: asDateString(first(row, ["forecast_date", "forecastDate", "prediction_date"])),
    targetDate: asDateString(first(row, ["target_date", "targetDate"])),
    leadDays: asNumber(first(row, ["lead_days", "leadDays", "lead_time", "lead"])),
    probability: asFraction(first(row, ["probability", "exc_probability"])),
    call: textOrNull(first(row, ["call", "prediction"])),
    threshold: asFraction(first(row, ["threshold"])),
    publishTimestampUtc: asTimestamp(first(row, ["publish_timestamp_utc", "publishTimestampUtc", "publish_time"])),
    modelVersion: textOrNull(first(row, ["model_version", "modelVersion"])),
    lastSampleDate: asDateString(first(row, ["last_sample_date", "lastSampleDate"])),
    lastSampleAgeDays: asNumber(first(row, ["last_sample_age_days", "lastSampleAgeDays", "sample_age", "days_since_sample"])),
    fallbackUsed: asBool(first(row, ["fallback_used", "fallbackUsed", "fallback"])),
    generatedAt: extra.generatedAt,
    calibratedProbability: extra.calibratedProbability,
    confidenceFlag: extra.confidenceFlag,
    reading: extra.reading,
    neptuneIndex: indexFields.index,
    neptuneBand: indexFields.band,
  };
}

export function groupArchive(rows: ArchiveRow[]): Map<string, StationArchive> {
  const byStation = new Map<string, ArchiveRow[]>();
  for (const row of rows) {
    const list = byStation.get(row.stationCode) ?? [];
    list.push(row);
    byStation.set(row.stationCode, list);
  }
  const out = new Map<string, StationArchive>();
  for (const [code, list] of byStation) {
    const dates = list.map((row) => row.forecastDate).filter((date): date is string => !!date);
    const latestDate = dates.reduce((max, date) => (date > max ? date : max), "");
    const sameDay = latestDate ? list.filter((row) => row.forecastDate === latestDate) : list;
    const stamps = sameDay
      .map((row) => row.publishTimestampUtc)
      .filter((stamp): stamp is string => !!stamp)
      .sort();
    const latestStamp = stamps.length ? stamps[stamps.length - 1] : null;
    const published = latestStamp
      ? sameDay.filter((row) => !row.publishTimestampUtc || row.publishTimestampUtc === latestStamp)
      : sameDay;
    const byLead = new Map<number, ArchiveRow>();
    for (const row of published) {
      if (row.leadDays == null) continue;
      const prev = byLead.get(row.leadDays);
      if (!prev || (row.publishTimestampUtc ?? "") >= (prev.publishTimestampUtc ?? "")) {
        byLead.set(row.leadDays, row);
      }
    }
    const nowcast = byLead.get(0) ?? null;
    const forecast = [1, 2, 3]
      .map((lead) => byLead.get(lead))
      .filter((row): row is ArchiveRow => row != null);
    const source = nowcast ?? forecast[0] ?? published[0] ?? null;
    out.set(code, {
      nowcast,
      forecast,
      modelVersion: source?.modelVersion ?? null,
      publishTimestampUtc: source?.publishTimestampUtc ?? null,
      fallbackUsed: source?.fallbackUsed ?? null,
      lastSampleDate: source?.lastSampleDate ?? null,
      lastSampleAgeDays: source?.lastSampleAgeDays ?? null,
      calibratedProbability: nowcast?.calibratedProbability ?? source?.calibratedProbability ?? null,
      confidenceFlag: nowcast?.confidenceFlag ?? source?.confidenceFlag ?? null,
      reading: nowcast?.reading ?? source?.reading ?? { ...EMPTY_READING },
      generatedAt: source?.generatedAt ?? null,
    });
  }
  return out;
}

export function parseStaleness(data: unknown): StalenessTable {
  const table: StalenessTable = { defaultDays: null, byCounty: {} };
  if (!isObj(data)) return table;
  const fallback = data.default_days ?? data.defaultDays ?? data.default;
  const fallbackDays = asNumber(fallback);
  if (fallbackDays != null) table.defaultDays = fallbackDays;
  const counties = data.counties ?? data.by_county ?? data.thresholds;
  const assign = (name: unknown, days: unknown) => {
    const key = countyKey(name);
    const value = asNumber(days);
    if (key && value != null) table.byCounty[key] = value;
  };
  if (Array.isArray(counties)) {
    for (const row of counties) {
      if (!isObj(row)) continue;
      assign(row.county ?? row.name, row.days ?? row.stale_after_days ?? row.limit_days ?? row.limit);
    }
  } else if (isObj(counties)) {
    for (const [name, days] of Object.entries(counties)) assign(name, days);
  } else {
    for (const [name, days] of Object.entries(data)) {
      if (["default_days", "defaultDays", "default", "counties", "by_county", "thresholds"].includes(name)) continue;
      assign(name, days);
    }
  }
  return table;
}

export function staleLimitDays(county: string | null, table: StalenessTable | null): number | null {
  if (!table) return null;
  const key = countyKey(county);
  if (key && table.byCounty[key] != null) return table.byCounty[key];
  return table.defaultDays;
}

export function parseRegions(data: unknown): RegionConfig {
  const config: RegionConfig = { rosterPath: null, regions: [] };
  if (!isObj(data)) return config;
  const roster = data.roster ?? data.roster_path ?? data.rosterPath ?? data.path;
  if (typeof roster === "string" && roster.trim()) config.rosterPath = roster.trim();
  const regions = data.regions ?? data.groups;
  if (!Array.isArray(regions)) return config;
  for (const region of regions) {
    if (!isObj(region)) continue;
    const name = textOrNull(region.name ?? region.label ?? region.id);
    if (!name) continue;
    const counties = Array.isArray(region.counties)
      ? region.counties.map((county) => normalizeCounty(county)).filter((county): county is string => !!county)
      : [];
    config.regions.push({ name, counties });
  }
  return config;
}

export function regionForCounty(county: string | null, regions: RegionDef[]): string | null {
  const key = countyKey(county);
  if (!key) return null;
  for (const region of regions) {
    if (region.counties.some((name) => countyKey(name) === key)) return region.name;
  }
  return null;
}

export function parseManifest(data: unknown): RunManifest {
  if (!isObj(data)) {
    return { generatedAt: null, modelVersion: null, staleCounties: [], checksPassed: null };
  }
  const stale = data.stale_counties ?? data.staleCounties ?? [];
  return {
    generatedAt: asTimestamp(data.generated_at ?? data.generatedAt),
    modelVersion: textOrNull(data.model_version ?? data.modelVersion),
    staleCounties: Array.isArray(stale)
      ? stale.map((county) => normalizeCounty(county)).filter((county): county is string => !!county)
      : [],
    checksPassed: asBool(data.checks_passed ?? data.checksPassed),
  };
}

export function countyInStaleList(county: string | null, staleCounties: string[]): boolean {
  const key = countyKey(county);
  if (!key) return false;
  return staleCounties.some((name) => countyKey(name) === key);
}

export interface DailyStatusFile {
  readings: Map<string, PublishedReading>;
  generatedAt: string | null;
}

const DAILY_STATION_KEYS = ["station_code", "stationCode", "StationCode", "station", "code"];
const DAILY_LIST_KEYS = ["stations", "beaches", "readings", "records", "status"];
const DATED_STATUS_FILE = /^(\d{4}-\d{2}-\d{2})\.(csv|json)$/;

function readingsFromRows(rows: Record<string, unknown>[]): Map<string, PublishedReading> {
  const readings = new Map<string, PublishedReading>();
  for (const row of rows) {
    const code = stationCode(first(row, DAILY_STATION_KEYS));
    if (!code) continue;
    readings.set(code, parsePublishedReading(row));
  }
  return readings;
}

/**
 * One current daily file, or one dated history file.
 * The last row for a station replaces earlier rows in that same file.
 * An empty payload is an empty map. It does not mean "ignore this file."
 */
export function parseDailyStatus(data: unknown): DailyStatusFile {
  if (Array.isArray(data)) {
    return { readings: readingsFromRows(data.filter(isObj)), generatedAt: null };
  }
  if (!isObj(data)) return { readings: new Map(), generatedAt: null };
  const generatedAt = asTimestamp(first(data, GENERATED_KEYS));
  for (const key of DAILY_LIST_KEYS) {
    const value = data[key];
    if (Array.isArray(value)) {
      return { readings: readingsFromRows(value.filter(isObj)), generatedAt };
    }
  }
  const code = stationCode(first(data, DAILY_STATION_KEYS));
  if (code) return { readings: new Map([[code, parsePublishedReading(data)]]), generatedAt };
  return { readings: new Map(), generatedAt };
}

export function parseDailyStatusRows(rows: Record<string, unknown>[]): DailyStatusFile {
  let generatedAt: string | null = null;
  for (const row of rows) {
    if (generatedAt) break;
    generatedAt = asTimestamp(first(row, GENERATED_KEYS));
  }
  return { readings: readingsFromRows(rows), generatedAt };
}

/** Newest `YYYY-MM-DD.csv` or `.json` name. Other names are ignored. */
export function latestDatedStatusName(names: string[]): string | null {
  let best: { date: string; name: string } | null = null;
  for (const name of names) {
    const match = name.match(DATED_STATUS_FILE);
    if (!match) continue;
    if (!best || match[1] > best.date) best = { date: match[1], name };
  }
  return best?.name ?? null;
}
