import "server-only";

import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Papa from "papaparse";
import {
  dailyRowsFromPayload,
  emptyDailyStatus,
  emptyLeadStatus,
  groupArchive,
  hasAgencyColumn,
  hasLeadColumn,
  jsonHasAgencyColumn,
  latestDatedStatusName,
  leadZeroSourceRows,
  parseArchiveRow,
  parseDailyStatus,
  parseDailyStatusRows,
  parseLeadStatusRows,
  selectDailySource,
  type DailyJoinedRow,
  type DailySourceMode,
  type DailyStatusFile,
  type LeadStatusFile,
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
import { parseIndexBands, type IndexScale } from "./neptuneIndex.ts";
import { fetchNeptuneV2Snapshot, formatRemoteErrors, NEPTUNE_V2_REPO, NEPTUNE_V2_REF } from "./neptuneRemote.ts";
import type { PublishedReading } from "./publishedReading.ts";

/**
 * The only module that opens Neptune files.
 *
 * Preference order for a statewide board:
 *   1. NEPTUNE_V2_DIR, when set (a local checkout of project-neptune-v2)
 *   2. The latest files from eymoney13/project-neptune-v2 main, fetched at runtime
 *   3. data/neptune-v2 in this repo (committed snapshot, used when that fetch fails)
 *   4. public/data/<slug> published CSVs
 *
 * Wide nowcast and forecast files are optional on top of the archive. When a
 * v2 path is missing, the published CSV for that input is used instead.
 */

export interface V2Bundle {
  available: boolean;
  root: string | null;
  roster: RosterStation[];
  /** True when the roster file's header includes `agency`, even if some cells are blank. */
  rosterAgencyColumn: boolean;
  archive: Map<string, StationArchive>;
  /** True when the archive file's header includes `agency`. The map key is then code plus agency. */
  archiveAgencyColumn: boolean;
  staleness: StalenessTable | null;
  /** Band table from this root's `config/neptune_index_bands.json`. Null when that file is absent. */
  indexScale: IndexScale | null;
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
  /** Every kept daily row, including codes that belong to more than one beach. */
  dailyRows: DailyJoinedRow[];
  dailyAgencyColumn: boolean;
  /** Clock from that daily file. Used after the manifest and before the nowcast column. */
  dailyGeneratedAt: string | null;
  /**
   * Optional `outputs/daily_status.csv` when it has a lead column.
   * Empty when that file is absent. It does not replace `outputs/daily/current.csv`.
   * `dayN_release` on either file is the go-live mark. A filled cell on the
   * current file wins over a filled cell on the lead table.
   */
  dailyLeads: LeadStatusFile;
  /** Which file `dailyRows` came from. `leads` means those rows are lead 0. */
  dailySource: DailySourceMode;
}

const EMPTY_BUNDLE: V2Bundle = {
  available: false,
  root: null,
  roster: [],
  rosterAgencyColumn: false,
  archive: new Map(),
  archiveAgencyColumn: false,
  staleness: null,
  indexScale: null,
  regions: null,
  manifest: null,
  nowcast: null,
  forecast: null,
  history: null,
  accuracy: null,
  thresholds: null,
  daily: new Map(),
  dailyIndex: new Map(),
  dailyRows: [],
  dailyAgencyColumn: false,
  dailyGeneratedAt: null,
  dailyLeads: emptyLeadStatus(),
  dailySource: "history",
};

/**
 * Preference:
 *   1. NEPTUNE_V2_DIR, a local checkout. Set NEPTUNE_V2_REMOTE=off to skip the network.
 *   2. A snapshot just read from project-neptune-v2 main (raw, then the contents API).
 *   3. data/neptune-v2 in this repo, the committed fallback.
 */
async function v2Roots(): Promise<string[]> {
  const env = process.env.NEPTUNE_V2_DIR?.trim();
  const roots = env ? [env] : [];
  if (!env && process.env.NEPTUNE_V2_REMOTE !== "off") {
    const remote = await remoteSnapshotRoot();
    if (remote) roots.push(remote);
  }
  roots.push(path.join(process.cwd(), "data", "neptune-v2"));
  return roots;
}

let remoteSnapshot: Promise<string | null> | null = null;

function remoteToken(): string | null {
  const named = process.env.NEPTUNE_V2_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  return named || null;
}

async function remoteSnapshotRoot(): Promise<string | null> {
  if (!remoteSnapshot) remoteSnapshot = materializeRemoteSnapshot();
  return remoteSnapshot;
}

async function materializeRemoteSnapshot(): Promise<string | null> {
  const attempt = await fetchNeptuneV2Snapshot({ token: remoteToken() });
  if (!attempt.ok) {
    console.warn(
      `[neptune-v2] Could not read ${NEPTUNE_V2_REPO} ${NEPTUNE_V2_REF}. ${formatRemoteErrors(attempt)} Using the committed data/neptune-v2 snapshot.`
    );
    return null;
  }
  const root = path.join(tmpdir(), "neptune-v2-remote");
  await mkdir(root, { recursive: true });
  for (const [file, text] of Object.entries(attempt.files)) {
    const destination = path.join(root, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, text);
  }
  console.warn(`[neptune-v2] Read ${NEPTUNE_V2_REPO} ${NEPTUNE_V2_REF} via ${attempt.method}.`);
  return root;
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
  for (const candidate of await v2Roots()) {
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
  let rosterAgencyColumn = false;
  if (rosterPath?.endsWith(".json")) {
    const text = await readText(rosterPath);
    if (text) {
      const parsed = JSON.parse(text) as unknown;
      rosterAgencyColumn = jsonHasAgencyColumn(parsed);
      roster = parseRosterJson(parsed);
    }
  } else if (rosterPath) {
    const rows = await readCsvFile(rosterPath);
    rosterAgencyColumn = hasAgencyColumn(rows);
    roster = parseRosterRows(rows);
  }

  const archivePath = await firstExisting([
    path.join(root, "outputs", "forecast_archive", "forecasts.csv"),
  ]);
  const archiveRaw = archivePath ? await readCsvFile(archivePath) : [];
  const archiveAgencyColumn = hasAgencyColumn(archiveRaw);
  const archiveRows = archiveRaw.map(parseArchiveRow).filter((row) => row != null);
  const archive = groupArchive(archiveRows, archiveAgencyColumn);

  const stalePath = await firstExisting([path.join(root, "config", "staleness_thresholds.json")]);
  const staleText = stalePath ? await readText(stalePath) : null;
  const staleness = staleText ? parseStaleness(JSON.parse(staleText) as unknown) : null;

  const bandsPath = path.join(root, "config", "neptune_index_bands.json");
  const bandsText = await readText(bandsPath);
  const indexScale = bandsText ? parseIndexBands(JSON.parse(bandsText) as unknown) : null;

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
    rosterAgencyColumn,
    archive,
    archiveAgencyColumn,
    staleness,
    indexScale,
    regions,
    manifest,
    nowcast,
    forecast,
    history,
    accuracy,
    thresholds,
    daily: daily.file.readings,
    dailyIndex: daily.file.indexes,
    dailyRows: daily.file.rows,
    dailyAgencyColumn: daily.file.agencyColumn,
    dailyGeneratedAt: daily.file.generatedAt,
    dailyLeads: daily.leads,
    dailySource: daily.source,
  };
}

/** Band table from the same v2 root as the roster. Another tree's file is not used. */
export async function loadNeptuneIndexScale(): Promise<IndexScale | null> {
  return (await loadV2Bundle()).indexScale;
}

/**
 * `outputs/daily/current.csv` is the live statewide file. History is used only
 * when no current file exists. A current file that parses to no stations still
 * wins, so an empty publish does not resurrect yesterday's history.
 *
 * `outputs/daily_status.csv` is the optional multi-lead table (leads 0–3).
 * When that file has a lead column it is read beside the current file, and it
 * becomes the daily file only when the current file is absent. A status file
 * with no lead column stays the older one-row fallback.
 * `dayN_release` is read from both files. It is not read from forecast_3day.csv.
 */
async function loadDailyStatus(root: string): Promise<{ file: DailyStatusFile; leads: LeadStatusFile; source: DailySourceMode }> {
  const currentPath = await firstExisting([
    path.join(root, "outputs", "daily", "current.csv"),
    path.join(root, "outputs", "daily", "current.json"),
  ]);
  const statusPath = await firstExisting([
    path.join(root, "outputs", "daily_status.csv"),
    path.join(root, "outputs", "daily_status.json"),
    ...wideCandidates(root, "daily_status.csv").slice(1),
    ...wideCandidates(root, "daily_status.json").slice(1),
  ]);
  const statusRows = statusPath ? await readTable(statusPath) : null;
  const statusIsLead = statusRows ? hasLeadColumn(statusRows) : false;
  const mode = selectDailySource({
    hasCurrent: currentPath != null,
    statusPresent: statusRows != null,
    statusIsLead,
  });
  const leads = statusRows && statusIsLead ? parseLeadStatusRows(statusRows) : emptyLeadStatus();

  if (mode === "current" && currentPath) {
    return { file: await readDailyFile(currentPath), leads, source: mode };
  }
  if (mode === "leads" && statusRows) {
    return { file: parseDailyStatusRows(leadZeroSourceRows(statusRows)), leads, source: mode };
  }
  if (mode === "legacy-status" && statusPath) {
    return { file: await readDailyFile(statusPath), leads: emptyLeadStatus(), source: mode };
  }
  const history = await latestDailyHistory(root);
  if (!history) return { file: emptyDailyStatus(), leads, source: mode };
  return { file: await readDailyFile(history), leads, source: mode };
}

async function readTable(filePath: string): Promise<Record<string, unknown>[]> {
  if (filePath.endsWith(".json")) {
    const text = await readText(filePath);
    if (text == null) return [];
    return dailyRowsFromPayload(JSON.parse(text) as unknown);
  }
  return readCsvFile(filePath);
}

async function readDailyFile(filePath: string): Promise<DailyStatusFile> {
  if (filePath.endsWith(".json")) {
    const text = await readText(filePath);
    if (text == null) return emptyDailyStatus();
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
