/**
 * Reshape the published South Bay CSVs into the project-neptune-v2 file layout.
 *
 * This is a local stand-in. It does not invent probabilities, calls, or
 * coordinates: every number is copied from public/data/southbay. Names and
 * counties come from the labels already in lib/data.ts. sampling_frequency,
 * model_version, publish time, and fallback are left blank because those
 * columns are not in the published files.
 *
 * Point NEPTUNE_V2_DIR at a real project-neptune-v2 checkout to replace this.
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { coordinateWordUnknown, isInWestCoastBox, locationMarkedUnknown, outsideWestCoastLine } from "../lib/westCoastBox.mjs";

const root = process.cwd();
const source = path.join(root, "public", "data", "southbay");
const dest = path.join(root, "data", "neptune-v2");
if (fs.existsSync(path.join(dest, "outputs", "daily", "current.csv")) && process.env.NEPTUNE_REBUILD_SAMPLE !== "1") {
  console.error(
    "data/neptune-v2 already has outputs/daily/current.csv, the published snapshot. Refusing to replace it with the South Bay stand-in. Set NEPTUNE_REBUILD_SAMPLE=1 to rebuild that stand-in anyway."
  );
  process.exit(1);
}

const NAMES = {
  "Francis State Beach": "Half Moon Bay - Francis State Beach",
  O490: "Cowell Beach, Santa Cruz",
  PB5: "Pismo State Beach",
  WP0000037: "Goleta Beach",
  "13000": "Surfers Point at Seaside, Ventura",
  "DPH 002B": "Malibu - Surfrider Beach",
  DHS103: "Will Rogers State Beach",
  DHS104: "Santa Monica State Beach",
  "SMB-3-5": "Venice Beach (Brooks Ave.)",
  "SMB-3-6": "Venice Beach (Windward Ave.)",
  "DPH 122": "Playa del Rey",
  "SMB-2-10": "Dockweiler State Beach (Culver Blvd.)",
  "SMB-2-11": "Dockweiler State Beach (Westchester Storm Drain)",
  "SMB-2-13": "Dockweiler State Beach (Imperial HWY Storm Drain)",
  DHS110: "Dockweiler State Beach (North)",
  DHS111: "Dockweiler State Beach (Central)",
  DHS112: "Dockweiler State Beach (South)",
  DHS112B: "Dockweiler State Beach (South Jetty)",
  DHS113: "Manhattan Beach - 28th st",
  DHS114: "Hermosa Beach - 26th St",
  DHS115: "Hermosa Beach - Herondo St",
  DHS116: "Redondo Beach - Topaz",
  OSB04: "Seal Beach - Surfside",
  "SMB-7-9": "Outer Cabrillo Beach",
  "0": "Huntington State Beach",
  BNB05: "Newport Bay",
  DSB4Z: "Doheny State Beach (Drain 4)",
  CSD_S8: "San Diego - Station S8",
};

const COUNTIES = {
  "Francis State Beach": "San Mateo",
  O490: "Santa Cruz",
  PB5: "San Luis Obispo",
  WP0000037: "Santa Barbara",
  "13000": "Ventura",
  "DPH 002B": "Los Angeles",
  DHS103: "Los Angeles",
  DHS104: "Los Angeles",
  "SMB-3-5": "Los Angeles",
  "SMB-3-6": "Los Angeles",
  "DPH 122": "Los Angeles",
  "SMB-2-10": "Los Angeles",
  "SMB-2-11": "Los Angeles",
  "SMB-2-13": "Los Angeles",
  DHS110: "Los Angeles",
  DHS111: "Los Angeles",
  DHS112: "Los Angeles",
  DHS112B: "Los Angeles",
  DHS113: "Los Angeles",
  DHS114: "Los Angeles",
  DHS115: "Los Angeles",
  DHS116: "Los Angeles",
  "SMB-7-9": "Los Angeles",
  OSB04: "Orange",
  "0": "Orange",
  BNB05: "Orange",
  DSB4Z: "Orange",
  CSD_S8: "San Diego",
};

function read(name) {
  const text = fs.readFileSync(path.join(source, name), "utf8");
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

function codeOf(row) {
  const raw = row.StationCode;
  if (raw == null) return null;
  const code = String(raw).trim();
  return code === "" ? null : code;
}

function subtractDays(iso, days) {
  if (!iso || days == null || days === "" || Number.isNaN(Number(days))) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - Number(days));
  return date.toISOString().slice(0, 10);
}

function countyFrom(row, code) {
  if (COUNTIES[code]) return COUNTIES[code];
  const name = String(row.StationName ?? "");
  const part = name.split(",").at(-1)?.trim();
  return part && part !== name ? part : "";
}

const nowcast = read("nowcast_latest.csv");
const forecast = read("forecast_3day.csv");
const thresholds = read("thresholds.csv");
const thresholdFor = new Map();
let fallbackThreshold = "0.5";
for (const row of thresholds) {
  const code = codeOf(row);
  if (!code || row.threshold == null || row.threshold === "") continue;
  if (code === "DEFAULT") fallbackThreshold = String(row.threshold);
  else thresholdFor.set(code, String(row.threshold));
}
const forecastByCode = new Map(forecast.map((row) => [codeOf(row), row]));

const stations = [];
const archive = [];
const coordinateNotes = [];
for (const row of nowcast) {
  const code = codeOf(row);
  if (!code) continue;
  const issued = String(row.prediction_date ?? "").slice(0, 10);
  const age = row.days_since_sample ?? "";
  const station = {
    station_code: code,
    name: NAMES[code] ?? String(row.StationName || code),
    lat: row.Latitude ?? "",
    lon: row.Longitude ?? "",
    county: countyFrom(row, code),
    last_sample_date: subtractDays(issued, age),
    sampling_frequency: "",
    // A published nowcast is this sample's evidence that the station is modeled.
    // The live roster's own tier replaces this when NEPTUNE_V2_DIR is set.
    tier: "model_pool",
  };
  stations.push(station);
  coordinateNotes.push({ station, row });
  const threshold = thresholdFor.get(code) ?? fallbackThreshold;
  archive.push({
    station_code: code,
    forecast_date: issued,
    target_date: issued,
    lead_days: 0,
    probability: row.exc_probability ?? "",
    call: row.prediction ?? "",
    threshold,
    publish_timestamp_utc: "",
    model_version: "",
    last_sample_date: station.last_sample_date,
    last_sample_age_days: age,
    fallback_used: "",
  });
  const ahead = forecastByCode.get(code);
  if (!ahead) continue;
  for (const lead of [1, 2, 3]) {
    const target = ahead[`day${lead}_date`];
    const probability = ahead[`day${lead}_probability`];
    if (!target || probability == null || probability === "") continue;
    archive.push({
      station_code: code,
      forecast_date: issued,
      target_date: String(target).slice(0, 10),
      lead_days: lead,
      probability,
      call: ahead[`day${lead}_prediction`] ?? "",
      threshold,
      publish_timestamp_utc: "",
      model_version: "",
      last_sample_date: station.last_sample_date,
      last_sample_age_days: ahead[`day${lead}_days_since_sample`] ?? age,
      fallback_used: "",
    });
  }
}

fs.mkdirSync(path.join(dest, "data"), { recursive: true });
fs.mkdirSync(path.join(dest, "outputs", "forecast_archive"), { recursive: true });
fs.mkdirSync(path.join(dest, "config", "regions"), { recursive: true });
fs.writeFileSync(path.join(dest, "data", "roster.json"), JSON.stringify({ stations }, null, 2) + "\n");
fs.writeFileSync(path.join(dest, "data", "roster.csv"), Papa.unparse(stations) + "\n");
fs.writeFileSync(path.join(dest, "outputs", "forecast_archive", "forecasts.csv"), Papa.unparse(archive) + "\n");
fs.writeFileSync(
  path.join(dest, "config", "staleness_thresholds.json"),
  JSON.stringify({ default_days: 7, counties: {} }, null, 2) + "\n"
);
fs.writeFileSync(
  path.join(dest, "config", "regions", "california.json"),
  JSON.stringify({ id: "california", name: "California", roster: "data/roster.json", regions: [] }, null, 2) + "\n"
);
for (const name of ["nowcast_latest.csv", "forecast_3day.csv", "history_3day.csv", "accuracy.csv", "thresholds.csv"]) {
  fs.copyFileSync(path.join(source, name), path.join(dest, "outputs", name));
}
console.log(`Wrote ${stations.length} roster stations and ${archive.length} archive rows.`);
for (const { station, row } of coordinateNotes) {
  const latitude = station.lat === "" || station.lat == null ? Number.NaN : Number(station.lat);
  const longitude = station.lon === "" || station.lon == null ? Number.NaN : Number(station.lon);
  const locationUnknown = locationMarkedUnknown(row) || locationMarkedUnknown(station) || coordinateWordUnknown(station.lat) || coordinateWordUnknown(station.lon);
  const outside = Number.isFinite(latitude) && Number.isFinite(longitude) && !isInWestCoastBox(latitude, longitude);
  if (!outside && !locationUnknown) continue;
  console.log(outsideWestCoastLine({
    name: station.name,
    code: station.station_code,
    latitude,
    longitude,
    locationUnknown,
  }));
}
