/**
 * Pure parsers for project-neptune-v2 outputs.
 *
 * File names and column aliases live here so a rename is a one-file change.
 * Nothing in this module reads the filesystem or invents a measurement.
 */

import { coordinateWordUnknown, locationMarkedUnknown } from "./westCoastBox.mjs";

export { coordinateWordUnknown };
import { parseNeptuneBandId, parseNeptuneIndexValue, readNeptuneFields } from "./neptuneIndex.ts";
import {
  EMPTY_READING,
  parseConfidenceLevel,
  parseLeadMaturity,
  parseMethod,
  parsePublishedReading,
  withPostingFileDate,
  type ConfidenceLevel,
  type EstimateMethod,
  type LeadMaturity,
  type PublishedReading,
} from "./publishedReading.ts";

export type RosterTier = "model_pool" | "limited_data";

export interface RosterStation {
  stationCode: string;
  name: string;
  lat: number | null;
  lon: number | null;
  county: string | null;
  /** Set when the roster file has an `agency` column. Blank cells stay null. */
  agency: string | null;
  /** Unique pipeline id. Null when the column is absent or the cell is blank. */
  stationKey: string | null;
  lastSampleDate: string | null;
  samplingFrequency: string | null;
  tier: RosterTier | null;
  /**
   * The file marked this position unknown. The numbers may still be present.
   * A water-quality Unknown call is not this flag.
   */
  locationUnknown: boolean;
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
  /** Published score. Range checks happen when the bands file is applied. */
  neptuneIndex: number | null;
  /** Published band id from the display config. Null when absent or unknown. */
  neptuneBand: string | null;
  /** Set when the archive file has an `agency` column. */
  agency: string | null;
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
  /** Station keys the manifest flagged for a bad location. */
  coordinateFlags: string[];
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

export function locationUnknownFromRow(row: Record<string, unknown> | null | undefined): boolean {
  return locationMarkedUnknown(row);
}

export function parseRosterRecord(row: Record<string, unknown>): RosterStation | null {
  const code = stationCode(first(row, ["station_code", "stationCode", "StationCode", "code", "primary_station"]));
  if (!code) return null;
  const name = textOrNull(first(row, ["name", "station_name", "StationName", "beach_name", "beach"])) ?? code;
  const latRaw = first(row, ["lat", "latitude", "Latitude"]);
  const lonRaw = first(row, ["lon", "lng", "longitude", "Longitude"]);
  return {
    stationCode: code,
    name,
    lat: asNumber(latRaw),
    lon: asNumber(lonRaw),
    county: normalizeCounty(first(row, ["county", "County"])),
    agency: agencyFromRow(row),
    stationKey: stationKeyFromRow(row),
    lastSampleDate: asDateString(first(row, ["last_sample_date", "lastSampleDate"])),
    samplingFrequency: textOrNull(first(row, ["sampling_frequency", "samplingFrequency"])),
    tier: asTier(first(row, ["tier", "Tier"])),
    locationUnknown: locationUnknownFromRow(row) || coordinateWordUnknown(latRaw) || coordinateWordUnknown(lonRaw),
  };
}

/** True when any row carries an `agency` header, including a blank cell. */
export function hasAgencyColumn(rows: Record<string, unknown>[]): boolean {
  return rows.some((row) => Object.keys(row).some((key) => key.toLowerCase() === "agency"));
}

export function jsonHasAgencyColumn(data: unknown): boolean {
  return hasAgencyColumn(rowsFromJson(data));
}

export function agencyFromRow(row: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase() !== "agency") continue;
    return textOrNull(value);
  }
  return null;
}

export function stationKeyFromRow(row: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(row)) {
    const folded = key.toLowerCase();
    if (folded !== "station_key" && folded !== "stationkey") continue;
    return textOrNull(value);
  }
  return null;
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
    agency: agencyFromRow(row),
  };
}

export function groupArchive(rows: ArchiveRow[], agencyColumn = false): Map<string, StationArchive> {
  const byStation = new Map<string, ArchiveRow[]>();
  for (const row of rows) {
    const key = agencyColumn
      ? `${row.stationCode}\0${(row.agency ?? "").trim().toLowerCase()}`
      : row.stationCode;
    const list = byStation.get(key) ?? [];
    list.push(row);
    byStation.set(key, list);
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

function stalenessDays(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  return raw.threshold_days ?? raw.thresholdDays ?? raw.stale_after_days ?? raw.limit_days ?? raw.days ?? raw.limit;
}

export function parseStaleness(data: unknown): StalenessTable {
  const table: StalenessTable = { defaultDays: null, byCounty: {} };
  if (!isObj(data)) return table;
  const fallback = data.default_days ?? data.defaultDays ?? data.minimum_days ?? data.minimumDays ?? data.default;
  const fallbackDays = asNumber(fallback);
  if (fallbackDays != null) table.defaultDays = fallbackDays;
  const counties = data.counties ?? data.by_county ?? data.thresholds;
  const assign = (name: unknown, days: unknown) => {
    const key = countyKey(name);
    const value = asNumber(stalenessDays(days));
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

function staleCountyNames(raw: unknown): string[] {
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((county) => normalizeCounty(county))
      .filter((county): county is string => !!county);
  }
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const item of raw) {
    if (isObj(item)) {
      const flagged = item.stale ?? item.flagged ?? item.is_stale ?? item.isStale;
      if (flagged === false || flagged === 0 || flagged === "false") continue;
      const name = normalizeCounty(item.county ?? item.name ?? item.county_name ?? item.countyName);
      if (name) names.push(name);
      continue;
    }
    const name = normalizeCounty(item);
    if (name) names.push(name);
  }
  return names;
}

function staleCountiesFromManifest(data: Record<string, unknown>): string[] {
  const direct = staleCountyNames(data.stale_counties ?? data.staleCounties);
  if (direct.length > 0) return direct;
  for (const key of ["stats", "summary", "run"]) {
    const nested = data[key];
    if (!isObj(nested)) continue;
    const names = staleCountyNames(nested.stale_counties ?? nested.staleCounties);
    if (names.length > 0) return names;
  }
  return [];
}

function coordinateFlagsFromManifest(data: Record<string, unknown>): string[] {
  const raw = data.coordinate_flags ?? data.coordinateFlags;
  if (!Array.isArray(raw)) return [];
  const keys: string[] = [];
  for (const item of raw) {
    if (!isObj(item)) continue;
    const key = textOrNull(item.station_key ?? item.stationKey);
    if (key) keys.push(key);
  }
  return keys;
}

export function parseManifest(data: unknown): RunManifest {
  if (!isObj(data)) {
    return { generatedAt: null, modelVersion: null, staleCounties: [], checksPassed: null, coordinateFlags: [] };
  }
  const nested = ["stats", "summary", "run"].map((key) => data[key]).find(isObj);
  return {
    generatedAt: asTimestamp(data.generated_at ?? data.generatedAt ?? nested?.generated_at ?? nested?.generatedAt),
    modelVersion: textOrNull(data.model_version ?? data.modelVersion ?? nested?.model_version ?? nested?.modelVersion),
    staleCounties: staleCountiesFromManifest(data),
    checksPassed: asBool(data.checks_passed ?? data.checksPassed ?? nested?.checks_passed ?? nested?.checksPassed),
    coordinateFlags: coordinateFlagsFromManifest(data),
  };
}

export function countyInStaleList(county: string | null, staleCounties: string[]): boolean {
  const key = countyKey(county);
  if (!key) return false;
  return staleCounties.some((name) => countyKey(name) === key);
}

export interface DailyIndexFields {
  index: number | null;
  band: string | null;
}

/** One lead on a current.csv row. Lead 0 is the same-day nowcast. */
export interface DailyHorizon {
  probability: number | null;
  call: string | null;
  calibratedProbability: number | null;
  method: EstimateMethod | null;
  confidence: ConfidenceLevel | null;
  index: number | null;
  band: string | null;
}

/** One kept daily row. Repeated codes stay separate when agency or name and county differ. */
export interface DailyJoinedRow {
  code: string;
  agency: string | null;
  name: string | null;
  county: string | null;
  /** Unique pipeline id from this row. Null when the cell is blank or absent. */
  stationKey: string | null;
  reading: PublishedReading;
  index: DailyIndexFields;
  /**
   * `day0_release` through `day3_release` on this row.
   * Null when that cell is blank, missing, or not `go_live` / `experimental`.
   * Day 0 is stored and does not label today's reading Experimental.
   */
  releases: DayReleases;
  /** This row's location status or flag says the position is unknown. */
  locationUnknown: boolean;
  /**
   * `call` or `prediction` on this daily row. Not `final_status`.
   * The word Unknown is a no-call even when probability is blank.
   */
  call: string | null;
  /** `probability` or `exc_probability`. Null when the cell is blank. */
  probability: number | null;
  /** Calibrated probability on this row. Null when the column is absent. */
  calibratedProbability: number | null;
  /** `prediction_date`, `forecast_date`, `date`, or the row's `generated_at`. */
  predictionDate: string | null;
  /** Leads 0–3. Lead 0 reads `nowcast_probability` / `nowcast_call` before the older names. */
  horizons: DailyHorizon[];
  /** `last_result_mpn` on this row. Null when the cell is blank. */
  lastResultMpn: number | null;
  /** `last_sample_age_days` on this row. */
  lastSampleAgeDays: number | null;
  /** `last_sample_date` on this row. */
  lastSampleDate: string | null;
  /** `fallback_used` on this row. */
  fallbackUsed: boolean | null;
}

function horizonFromRow(row: Record<string, unknown>, lead: number): DailyHorizon {
  const probability =
    lead === 0
      ? asFraction(first(row, ["nowcast_probability", "probability", "exc_probability"]))
      : asFraction(first(row, [`day${lead}_probability`, `day${lead}Probability`]));
  const call =
    lead === 0
      ? textOrNull(first(row, ["alert_flag", "nowcast_alert_flag", "nowcast_call", "call", "prediction"]))
      : textOrNull(first(row, [`day${lead}_alert_flag`, `day${lead}_call`, `day${lead}_prediction`, `day${lead}Call`]));
  const specificCalibrated = asFraction(
    first(row, [`day${lead}_calibrated_probability`, `day${lead}CalibratedProbability`])
  );
  const calibratedProbability =
    specificCalibrated ?? (lead === 0 ? asFraction(first(row, CALIBRATED_KEYS)) : null);
  const specificMethod = parseMethod(first(row, [`day${lead}_method`, `day${lead}Method`]));
  const method = specificMethod ?? (lead === 0 ? parseMethod(first(row, ["method", "estimate_method"])) : null);
  const specificConfidence = parseConfidenceLevel(first(row, [`day${lead}_confidence`, `day${lead}Confidence`]));
  const confidence =
    specificConfidence ?? (lead === 0 ? parseConfidenceLevel(first(row, ["confidence", "confidence_level"])) : null);
  const index =
    lead === 0
      ? readNeptuneFields(row).index
      : parseNeptuneIndexValue(first(row, [`day${lead}_neptune_index`, `day${lead}NeptuneIndex`]));
  const band =
    lead === 0
      ? readNeptuneFields(row).band
      : parseNeptuneBandId(first(row, [`day${lead}_neptune_band`, `day${lead}NeptuneBand`]));
  return { probability, call, calibratedProbability, method, confidence, index, band };
}

function dailyMeasureFields(row: Record<string, unknown>) {
  const horizons = [0, 1, 2, 3].map((lead) => horizonFromRow(row, lead));
  const today = horizons[0] ?? horizonFromRow(row, 0);
  return {
    horizons,
    call: today.call,
    probability: today.probability,
    calibratedProbability: today.calibratedProbability,
    predictionDate:
      asDateString(first(row, ["prediction_date", "forecast_date", "date"])) ??
      asDateString(first(row, GENERATED_KEYS)),
    lastResultMpn: asNumber(first(row, ["last_result_mpn", "last_result", "lastResult"])),
    lastSampleAgeDays: asNumber(first(row, ["last_sample_age_days", "lastSampleAgeDays", "days_since_sample"])),
    lastSampleDate: asDateString(first(row, ["last_sample_date", "lastSampleDate"])),
    fallbackUsed: asBool(first(row, ["fallback_used", "fallbackUsed"])),
  };
}

export interface DailyStatusFile {
  /**
   * Reading for a station code that collapsed to one identity. Undefined when
   * that code belongs to more than one beach in the file.
   */
  readings: Map<string, PublishedReading>;
  /** Neptune Index columns on the same daily row. Empty cells stay null. */
  indexes: Map<string, DailyIndexFields>;
  /** Last row of each distinct beach. Order follows the first time that beach appeared. */
  rows: DailyJoinedRow[];
  agencyColumn: boolean;
  /** Station codes that appear on more than one raw row, before identity collapse. */
  duplicateCodes: string[];
  generatedAt: string | null;
}

const DAILY_STATION_KEYS = ["station_code", "stationCode", "StationCode", "station", "code"];
const DAILY_NAME_KEYS = ["name", "station_name", "StationName", "beach_name", "beach"];
const DAILY_COUNTY_KEYS = ["county", "County"];
const DAILY_LIST_KEYS = ["stations", "beaches", "readings", "records", "status"];
const DATED_STATUS_FILE = /^(\d{4}-\d{2}-\d{2})\.(csv|json)$/;

export function emptyDailyStatus(generatedAt: string | null = null): DailyStatusFile {
  return {
    readings: new Map(),
    indexes: new Map(),
    rows: [],
    agencyColumn: false,
    duplicateCodes: [],
    generatedAt,
  };
}

function dailyIdentityKey(row: DailyJoinedRow, agencyColumn: boolean): string {
  if (row.stationKey) return `key\0${row.stationKey.trim().toLowerCase()}`;
  if (agencyColumn) return `${row.code}\0${(row.agency ?? "").trim().toLowerCase()}`;
  if (row.name || row.county) {
    return `${row.code}\0${(row.name ?? "").trim().toLowerCase()}\0${(row.county ?? "").trim().toLowerCase()}`;
  }
  return row.code;
}

function readingsFromRows(rows: Record<string, unknown>[], generatedAt: string | null): Omit<DailyStatusFile, "generatedAt"> {
  const agencyColumn = hasAgencyColumn(rows);
  const rawCount = new Map<string, number>();
  const byIdentity = new Map<string, DailyJoinedRow>();
  const order: string[] = [];
  for (const row of rows) {
    const code = stationCode(first(row, DAILY_STATION_KEYS));
    if (!code) continue;
    rawCount.set(code, (rawCount.get(code) ?? 0) + 1);
    const extra = optionalModelFields(row);
    const joined: DailyJoinedRow = {
      code,
      agency: agencyColumn ? agencyFromRow(row) : null,
      name: textOrNull(first(row, DAILY_NAME_KEYS)),
      county: normalizeCounty(first(row, DAILY_COUNTY_KEYS)),
      stationKey: stationKeyFromRow(row),
      reading: withPostingFileDate(extra.reading, generatedAt),
      index: readNeptuneFields(row),
      releases: dayReleasesFromRow(row),
      locationUnknown: locationUnknownFromRow(row),
      ...dailyMeasureFields(row),
    };
    const key = dailyIdentityKey(joined, agencyColumn);
    if (!byIdentity.has(key)) order.push(key);
    byIdentity.set(key, joined);
  }
  const kept = order.map((key) => byIdentity.get(key)!);
  const identities = new Map<string, number>();
  for (const row of kept) identities.set(row.code, (identities.get(row.code) ?? 0) + 1);
  const readings = new Map<string, PublishedReading>();
  const indexes = new Map<string, DailyIndexFields>();
  for (const row of kept) {
    if (identities.get(row.code) !== 1) continue;
    readings.set(row.code, row.reading);
    indexes.set(row.code, row.index);
  }
  return {
    readings,
    indexes,
    rows: kept,
    agencyColumn,
    duplicateCodes: [...rawCount.entries()].filter(([, count]) => count > 1).map(([code]) => code),
  };
}

/**
 * One current daily file, or one dated history file.
 * The last row for one beach replaces earlier rows of that same beach.
 * A filled station_key is that beach. Otherwise a repeated station code is kept
 * when agency, or name and county, differs.
 * An empty payload is an empty file. It does not mean "ignore this file."
 */
export function parseDailyStatus(data: unknown): DailyStatusFile {
  if (Array.isArray(data)) {
    return { ...readingsFromRows(data.filter(isObj), null), generatedAt: null };
  }
  if (!isObj(data)) return emptyDailyStatus();
  const generatedAt = asTimestamp(first(data, GENERATED_KEYS));
  for (const key of DAILY_LIST_KEYS) {
    const value = data[key];
    if (Array.isArray(value)) {
      return { ...readingsFromRows(value.filter(isObj), generatedAt), generatedAt };
    }
  }
  if (stationCode(first(data, DAILY_STATION_KEYS))) {
    return { ...readingsFromRows([data], generatedAt), generatedAt };
  }
  return emptyDailyStatus(generatedAt);
}

/**
 * Which daily file to trust. `outputs/daily/current.csv` stays the fallback
 * until the pipeline publishes `outputs/daily_status.csv` in its place.
 * A lead column on that status file is the new multi-lead table. Without one,
 * the same path is the older one-row daily file.
 */
export type DailySourceMode = "current" | "leads" | "legacy-status" | "history";

export function selectDailySource(input: {
  hasCurrent: boolean;
  statusPresent: boolean;
  statusIsLead: boolean;
}): DailySourceMode {
  if (input.hasCurrent) return "current";
  if (input.statusPresent && input.statusIsLead) return "leads";
  if (input.statusPresent) return "legacy-status";
  return "history";
}

const LEAD_HEADERS = new Set(["lead_days", "leaddays", "lead_time", "leadtime", "lead"]);

/** `day0_release` … `day3_release`. Index is the lead. */
export type DayReleases = readonly [LeadMaturity | null, LeadMaturity | null, LeadMaturity | null, LeadMaturity | null];

/** One station at one lead. Method and the high/medium/low level live on `reading`. */
export interface LeadStatusRow extends DailyJoinedRow {
  lead: number;
  /**
   * `day{lead}_release` on this row.
   * Null when that cell is blank, missing, or not go_live / experimental.
   */
  maturity: LeadMaturity | null;
}

export interface LeadStatusFile {
  rows: LeadStatusRow[];
  agencyColumn: boolean;
}

export function emptyLeadStatus(): LeadStatusFile {
  return { rows: [], agencyColumn: false };
}

function foldedHeader(key: string): string {
  return key.toLowerCase().replace(/-/g, "_");
}

/** True when a row carries a lead header, even if that cell is blank. */
export function hasLeadColumn(rows: Record<string, unknown>[]): boolean {
  return rows.some((row) => Object.keys(row).some((key) => LEAD_HEADERS.has(foldedHeader(key).replace(/_/g, "")) || LEAD_HEADERS.has(foldedHeader(key))));
}

function leadNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(value) || value < 0 || value > 3) return null;
  return value;
}

export function leadNumberFromRow(row: Record<string, unknown>): number | null {
  for (const [key, value] of Object.entries(row)) {
    const folded = foldedHeader(key);
    if (!LEAD_HEADERS.has(folded) && !LEAD_HEADERS.has(folded.replace(/_/g, ""))) continue;
    return leadNumber(value);
  }
  return null;
}

/**
 * `dayN_release` for N = 0–3 on `outputs/daily/current.csv` or `outputs/daily_status.csv`.
 * `dayNRelease` and `dayN-release` are the same column. Nothing else is:
 * `dayN_go_live`, `dayN_maturity`, `dayN_release_status`, a bare `go_live` or
 * `release`, and any confidence column stay unread. `forecast_3day.csv` is not
 * a source; callers must not pass that row here.
 * A blank cell and an unrecognized word are null, which keeps Experimental.
 */
export function leadRelease(row: Record<string, unknown> | null | undefined, lead: number): LeadMaturity | null {
  if (!row || !Number.isInteger(lead) || lead < 0 || lead > 3) return null;
  const wanted = `day${lead}_release`;
  const compactWanted = `day${lead}release`;
  for (const [key, value] of Object.entries(row)) {
    const folded = foldedHeader(key);
    if (folded !== wanted && folded.replace(/_/g, "") !== compactWanted) continue;
    return parseLeadMaturity(value);
  }
  return null;
}

export function dayReleasesFromRow(row: Record<string, unknown>): DayReleases {
  return [leadRelease(row, 0), leadRelease(row, 1), leadRelease(row, 2), leadRelease(row, 3)];
}

/**
 * The mark that decides the Experimental label for look-ahead lead 1–3.
 * A non-blank cell on the daily file (`current.csv`, or a one-row status file)
 * wins. Pass null for that argument when the daily file is lead 0 of
 * `daily_status.csv`, so that lead's wide columns do not override the row for
 * this lead. A blank cell does not override a filled one. Then this lead's
 * own `dayN_release`, then the same column on another lead row.
 */
export function forecastRelease(
  dailyReleases: DayReleases | null | undefined,
  leadRows: readonly Pick<LeadStatusRow, "lead" | "maturity" | "releases">[],
  lead: number
): LeadMaturity | null {
  if (!Number.isInteger(lead) || lead < 0 || lead > 3) return null;
  const fromDaily = dailyReleases?.[lead] ?? null;
  if (fromDaily) return fromDaily;
  const own = leadRows.find((row) => row.lead === lead)?.maturity ?? null;
  if (own) return own;
  for (const row of leadRows) {
    const value = row.releases[lead];
    if (value) return value;
  }
  return null;
}

export function dailyRowsFromPayload(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isObj);
  if (!isObj(data)) return [];
  for (const key of DAILY_LIST_KEYS) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(isObj);
  }
  if (stationCode(first(data, DAILY_STATION_KEYS))) return [data];
  return [];
}

/** Long daily_status table: one row per station per lead 0–3. Last row wins later, at match time. */
export function parseLeadStatusRows(rows: Record<string, unknown>[]): LeadStatusFile {
  const agencyColumn = hasAgencyColumn(rows);
  const kept: LeadStatusRow[] = [];
  for (const row of rows) {
    const code = stationCode(first(row, DAILY_STATION_KEYS));
    const lead = leadNumberFromRow(row);
    if (!code || lead == null) continue;
    const extra = optionalModelFields(row);
    kept.push({
      code,
      agency: agencyColumn ? agencyFromRow(row) : null,
      name: textOrNull(first(row, DAILY_NAME_KEYS)),
      county: normalizeCounty(first(row, DAILY_COUNTY_KEYS)),
      stationKey: stationKeyFromRow(row),
      reading: extra.reading,
      index: readNeptuneFields(row),
      releases: dayReleasesFromRow(row),
      locationUnknown: locationUnknownFromRow(row),
      ...dailyMeasureFields(row),
      lead,
      maturity: leadRelease(row, lead),
    });
  }
  return { rows: kept, agencyColumn };
}

export function parseLeadStatus(data: unknown): LeadStatusFile {
  return parseLeadStatusRows(dailyRowsFromPayload(data));
}

/** Lead 0 rows from a multi-lead file, in file order, for the current-file parser. */
export function leadZeroSourceRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.filter((row) => leadNumberFromRow(row) === 0);
}

export function parseDailyStatusRows(rows: Record<string, unknown>[]): DailyStatusFile {
  let generatedAt: string | null = null;
  for (const row of rows) {
    if (generatedAt) break;
    generatedAt = asTimestamp(first(row, GENERATED_KEYS));
  }
  return { ...readingsFromRows(rows, generatedAt), generatedAt };
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
