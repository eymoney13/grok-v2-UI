import "server-only";

import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import {
  groupArchive,
  latestDatedStatusName,
  parseArchiveRow,
  parseDailyStatus,
  parseDailyStatusRows,
  type DailyStatusFile,
  parseManifest,
  parseRegions,
  parseRosterJson,
  parseRosterRows,
  parseStaleness,
  type DailyIndexFields,
  type RegionConfig,
  type RosterStation,
  type RunManifest,
  type StalenessTable,
  type StationArchive,
} from "./neptuneContract";
import type { PublishedReading } from "./publishedReading.ts";

/**
 * The only module that opens Neptune files.
 *
 * Preference order for a statewide board:
 *   1. NEPTUNE_V2_DIR, when set (a local checkout of project-neptune-v2)
 *   2. data/neptune-v2 in this repo (a sample in the v2 shape)
 *   3. public/data/<slug> published CSVs
 *
 * Wide nowcast and forecast files are optional on top of the archive. When a
 * v2 path is missing, the published CSV for that input is used instead.
 */

export interface V2Bundle {
  available: boolean;
  root: string | null;
  roster: RosterStation[];
  archive: Map<string, StationArchive>;
  staleness: StalenessTable | null;
  regions: RegionConfig | null;
  manifest: RunManifest | null;
  /** Null means the v2 tree has no file and the caller should use the published CSV. */
  nowcast: Record<string, unknown>[] | null;
  forecast: Record<string, unknown>[] | null;
  history: Record<string, unknown>[] | null;
  accuracy: Record<string, unknown>[] | null;
  thresholds: Record<string, number> | null;
  /**
   * Daily status from `outputs/daily/current.csv`, or from the newest dated
   * file beside it when that current file is absent. Empty when neither exists.
   */
  daily: Map<string, PublishedReading>;
  /** `neptune_index` and `neptune_band` from that same daily file. Empty cells are null. */
  dailyIndex: Map<string, DailyIndexFields>;
  /** Clock from that daily file. Used after the manifest and before the nowcast column. */
  dailyGeneratedAt: string | null;
}

const EMPTY_BUNDLE: V2Bundle = {
  available: false,
  root: null,
  roster: [],
  archive: new Map(),
  staleness: null,
  regions: null,
  manifest: null,
  nowcast: null,
  forecast: null,
  history: null,
  accuracy: null,
  thresholds: null,
  daily: new Map(),
  dailyIndex: new Map(),
  dailyGeneratedAt: null,
};

function v2Roots(): string[] {
  const env = process.env.NEPTUNE_V2_DIR?.trim();
  const roots = env ? [env] : [];
  roots.push(path.join(process.cwd(), "data", "neptune-v2"));
  return roots;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function firstExisting(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function readText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function readCsvFile(filePath: string): Promise<Record<string, unknown>[]> {
  const text = await readFile(filePath, "utf8");
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  return parsed.data.filter((row) => row != null && typeof row === "object");
}

export async function readPublishedCsv(slug: string, relPath: string): Promise<Record<string, unknown>[]> {
  const filePath = path.join(process.cwd(), "public", "data", slug, relPath);
  try {
    return await readCsvFile(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function readPublishedJson<T>(slug: string, relPath: string): Promise<T | null> {
  const text = await readText(path.join(process.cwd(), "public", "data", slug, relPath));
  if (text == null) return null;
  return JSON.parse(text) as T;
}

async function readCsvIfPresent(filePath: string | null): Promise<Record<string, unknown>[] | null> {
  if (!filePath) return null;
  return readCsvFile(filePath);
}

/** Keep a region-config roster path inside the v2 root. A `..` segment is rejected. */
function rosterFromRegion(root: string, rosterPath: string | null | undefined): string | null {
  if (!rosterPath) return null;
  const normalized = rosterPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").includes("..")) return null;
  // A literal "data" segment keeps the file trace inside the roster folder.
  if (!normalized.startsWith("data/")) return null;
  return path.join(/*turbopackIgnore: true*/ root, "data", normalized.slice("data/".length));
}

function wideCandidates(root: string, name: string): string[] {
  return [
    path.join(root, "outputs", name),
    path.join(root, "outputs", "california", name),
    path.join(root, "data", name),
    path.join(root, name),
  ];
}

async function loadThresholds(filePath: string | null): Promise<Record<string, number> | null> {
  const rows = await readCsvIfPresent(filePath);
  if (!rows) return null;
  const map: Record<string, number> = {};
  for (const row of rows) {
    const code = row.StationCode ?? row.station_code;
    const threshold = row.threshold;
    if (code != null && threshold != null && threshold !== "") {
      map[String(code)] = Number(threshold);
    }
  }
  return map;
}

export async function loadV2Bundle(): Promise<V2Bundle> {
  let root: string | null = null;
  for (const candidate of v2Roots()) {
    const roster = await firstExisting([
      path.join(candidate, "data", "roster.json"),
      path.join(candidate, "data", "roster.csv"),
    ]);
    if (roster) {
      root = candidate;
      break;
    }
  }
  if (!root) return EMPTY_BUNDLE;

  const regionPath = await firstExisting([
    path.join(root, "config", "regions", "california.json"),
  ]);
  const regionText = regionPath ? await readText(regionPath) : null;
  const regions = regionText ? parseRegions(JSON.parse(regionText) as unknown) : null;

  const rosterCandidates = [
    rosterFromRegion(root, regions?.rosterPath),
    path.join(root, "data", "roster.json"),
    path.join(root, "data", "roster.csv"),
  ].filter((item): item is string => !!item);
  const rosterPath = await firstExisting(rosterCandidates);
  let roster: RosterStation[] = [];
  if (rosterPath?.endsWith(".json")) {
    const text = await readText(rosterPath);
    roster = text ? parseRosterJson(JSON.parse(text) as unknown) : [];
  } else if (rosterPath) {
    roster = parseRosterRows(await readCsvFile(rosterPath));
  }

  const archivePath = await firstExisting([
    path.join(root, "outputs", "forecast_archive", "forecasts.csv"),
  ]);
  const archiveRows = archivePath
    ? (await readCsvFile(archivePath)).map(parseArchiveRow).filter((row) => row != null)
    : [];
  const archive = groupArchive(archiveRows);

  const stalePath = await firstExisting([path.join(root, "config", "staleness_thresholds.json")]);
  const staleText = stalePath ? await readText(stalePath) : null;
  const staleness = staleText ? parseStaleness(JSON.parse(staleText) as unknown) : null;

  const manifestPath = await firstExisting([path.join(root, "outputs", "run_manifest.json")]);
  const manifestText = manifestPath ? await readText(manifestPath) : null;
  const manifest = manifestText ? parseManifest(JSON.parse(manifestText) as unknown) : null;

  const daily = await loadDailyStatus(root);
  const nowcast = await readCsvIfPresent(await firstExisting(wideCandidates(root, "nowcast_latest.csv")));
  const forecast = await readCsvIfPresent(await firstExisting(wideCandidates(root, "forecast_3day.csv")));
  const history = await readCsvIfPresent(await firstExisting(wideCandidates(root, "history_3day.csv")));
  const accuracy = await readCsvIfPresent(await firstExisting(wideCandidates(root, "accuracy.csv")));
  const thresholds = await loadThresholds(await firstExisting(wideCandidates(root, "thresholds.csv")));

  return {
    available: roster.length > 0,
    root,
    roster,
    archive,
    staleness,
    regions,
    manifest,
    nowcast,
    forecast,
    history,
    accuracy,
    thresholds,
    daily: daily.readings,
    dailyIndex: daily.indexes,
    dailyGeneratedAt: daily.generatedAt,
  };
}

/**
 * `outputs/daily/current.csv` is the live statewide file. History is used only
 * when no current file exists. A current file that parses to no stations still
 * wins, so an empty publish does not resurrect yesterday's history.
 */
async function loadDailyStatus(root: string): Promise<{
  readings: Map<string, PublishedReading>;
  indexes: Map<string, DailyIndexFields>;
  generatedAt: string | null;
}> {
  const current = await firstExisting([
    path.join(root, "outputs", "daily", "current.csv"),
    path.join(root, "outputs", "daily", "current.json"),
    ...wideCandidates(root, "daily_status.csv"),
    ...wideCandidates(root, "daily_status.json"),
  ]);
  if (current) return readDailyFile(current);
  const history = await latestDailyHistory(root);
  if (!history) return { readings: new Map(), indexes: new Map(), generatedAt: null };
  return readDailyFile(history);
}

async function readDailyFile(filePath: string): Promise<DailyStatusFile> {
  if (filePath.endsWith(".json")) {
    const text = await readText(filePath);
    if (text == null) return { readings: new Map(), indexes: new Map(), generatedAt: null };
    return parseDailyStatus(JSON.parse(text) as unknown);
  }
  return parseDailyStatusRows(await readCsvFile(filePath));
}

async function latestDailyHistory(root: string): Promise<string | null> {
  const dirs = [
    path.join(root, "outputs", "daily"),
    path.join(root, "outputs", "daily", "history"),
    path.join(root, "outputs", "daily_status"),
    path.join(root, "outputs", "status_history"),
  ];
  let best: { date: string; file: string } | null = null;
  for (const dir of dirs) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") continue;
      throw err;
    }
    const name = latestDatedStatusName(names);
    const match = name?.match(/^(\d{4}-\d{2}-\d{2})\./);
    if (!name || !match) continue;
    if (!best || match[1] > best.date) best = { date: match[1], file: path.join(dir, name) };
  }
  return best?.file ?? null;
}
