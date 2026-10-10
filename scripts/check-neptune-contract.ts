import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  groupArchive,
  parseArchiveRow,
  parseManifest,
  parseRegions,
  parseRosterJson,
  parseStaleness,
  regionForCounty,
  staleLimitDays,
  latestDatedStatusName,
  optionalModelFields,
  dayReleasesFromRow,
  forecastRelease,
  hasLeadColumn,
  leadRelease,
  leadZeroSourceRows,
  parseDailyStatus,
  parseDailyStatusRows,
  parseLeadStatusRows,
  selectDailySource,
  textFlag,
} from "../lib/neptuneContract.ts";
import { resolvePublishedCall } from "../lib/data.ts";
import { matchDailyRow, matchLeadRows } from "../lib/stationIdentity.ts";
import {
  confidenceWords,
  mergeReadings,
  methodWords,
  isUnknownCall,
  officialPosting,
  openPostingWords,
  parseLeadMaturity,
  parseMethod,
  parsePostingStatus,
  parsePublishedReading,
  postingLabel,
  rainAdvisoryWords,
  unknownPostingWords,
} from "../lib/publishedReading.ts";
import {
  bandForValue,
  displayBandLabel,
  indexConfidenceNote,
  indexScalePhrase,
  parseIndexBands,
  parseNeptuneBandId,
  readNeptuneFields,
  resolveNeptuneDisplay,
} from "../lib/neptuneIndex.ts";

const roster = parseRosterJson({
  stations: [
    {
      station_code: "0",
      name: "Huntington State Beach",
      lat: 33.6,
      lon: -117.9,
      county: "Orange County",
      last_sample_date: "2026-08-01",
      sampling_frequency: "weekly",
      tier: "limited_data",
    },
    { station_code: "DHS114", name: "Hermosa", lat: 33.8, lon: -118.4, county: "Los Angeles", tier: "model_pool" },
  ],
});
assert.equal(roster.length, 2);
assert.equal(roster[0].stationCode, "0");
assert.equal(roster[0].county, "Orange");
assert.equal(roster[0].tier, "limited_data");
assert.equal(roster[0].samplingFrequency, "weekly");

const archive = groupArchive(
  [
    {
      station_code: "DHS114",
      forecast_date: "2026-10-09",
      target_date: "2026-10-09",
      lead_days: 0,
      probability: 0.41,
      call: "Safe",
      threshold: 0.5,
      publish_timestamp_utc: "2026-10-09T12:00:00Z",
      last_sample_age_days: 4,
      fallback_used: false,
      calibrated_probability: "55%",
      confidence: 0.8,
      confidence_flag: "sparse samples",
    },
    {
      station_code: "DHS114",
      forecast_date: "2026-10-09",
      target_date: "2026-10-10",
      lead_days: 1,
      probability: 80,
      call: "Unsafe",
    },
    {
      station_code: "DHS114",
      forecast_date: "2026-10-08",
      target_date: "2026-10-08",
      lead_days: 0,
      probability: 0.1,
      call: "Safe",
    },
  ].map((row) => {
    const parsed = parseArchiveRow(row);
    assert.ok(parsed);
    return parsed;
  })
);
const hermosa = archive.get("DHS114");
assert.ok(hermosa);
assert.equal(hermosa.nowcast?.probability, 0.41);
assert.equal(hermosa.forecast[0].probability, 0.8);
assert.equal(hermosa.forecast[0].leadDays, 1);
assert.equal(hermosa.calibratedProbability, 0.55);
assert.equal(hermosa.confidenceFlag, "sparse samples");
assert.equal(hermosa.nowcast?.reading.confidence, null);
assert.equal(textFlag(0.8), null);

const high = optionalModelFields({ confidence: "high", confidence_flag: "sparse samples" });
assert.equal(high.reading.confidence, "high");
assert.equal(high.confidenceFlag, "sparse samples");
const highOnly = optionalModelFields({ confidence: "High" });
assert.equal(highOnly.reading.confidence, "high");
assert.equal(highOnly.confidenceFlag, null);
const noted = optionalModelFields({ confidence: "sparse samples" });
assert.equal(noted.reading.confidence, null);
assert.equal(noted.confidenceFlag, "sparse samples");
assert.equal(parseMethod("pooled model"), "pooled_model");
assert.equal(parseMethod("pooled-model"), "pooled_model");
assert.equal(parseMethod("nope"), null);
assert.equal(methodWords("rules"), "Based on last lab test + rain rule.");
assert.match(confidenceWords("low")?.text ?? "", /less certain/);
assert.doesNotMatch(confidenceWords("high")?.text ?? "", /less certain/);

assert.equal(parsePostingStatus("closure"), "closure");
assert.equal(parsePostingStatus("Closed"), "closure");
assert.equal(parsePostingStatus("WARNING"), "warning");
assert.equal(parsePostingStatus("advisory"), "advisory");
assert.equal(parsePostingStatus("open"), "open");
assert.equal(parsePostingStatus("unknown"), "unknown");
assert.equal(parsePostingStatus("safe"), null);
assert.equal(parsePostingStatus(""), null);

const closed = officialPosting(
  parsePublishedReading({
    posting_status: "closure",
    posting_source: "Orange County",
    final_status: "Beach closed",
  })
);
assert.equal(closed?.kind, "closure");
assert.equal(closed?.detail, "Beach closed");
assert.equal(closed ? postingLabel(closed) : null, "Beach closed");
assert.equal(closed?.source, "Orange County");
assert.equal(officialPosting(parsePublishedReading({ final_status: "Over limit" })), null);
assert.equal(officialPosting(parsePublishedReading({ posting_status: "  " })), null);
assert.equal(officialPosting(parsePublishedReading({ posting_status: "unknown", final_status: "Safe" })), null);
assert.equal(isUnknownCall("Unknown"), true);
assert.equal(isUnknownCall(" unknown "), true);
assert.equal(isUnknownCall("safe"), false);
const unknownClosure = officialPosting(parsePublishedReading({ posting_status: "closure", final_status: "Unknown" }));
assert.equal(unknownClosure?.kind, "closure");
assert.equal(unknownClosure?.detail, null);
assert.equal(unknownClosure ? postingLabel(unknownClosure) : null, "Closure");
assert.equal(officialPosting(parsePublishedReading({ posting_status: "closure", final_status: "Beach closed" }))?.detail, "Beach closed");
assert.deepEqual(resolvePublishedCall("Unknown", 0.1, 0.5), { verdict: null, callUnknown: true });
assert.deepEqual(resolvePublishedCall("safe", 0.1, 0.5).callUnknown, false);
assert.equal(resolvePublishedCall("safe", 0.1, 0.5).verdict, "Good");
assert.equal(resolvePublishedCall("unsafe", 0.1, 0.5).verdict, "Poor");
assert.equal(resolvePublishedCall("", 0.1, 0.5).verdict, "Good");
assert.equal(officialPosting(parsePublishedReading({ posting_status: "open", final_status: "Safe" })), null);
assert.match(unknownPostingWords(parsePublishedReading({ posting_status: "unknown" })) ?? "", /No official posting data for this beach/);
assert.doesNotMatch(unknownPostingWords(parsePublishedReading({ posting_status: "unknown" })) ?? "", /safe/i);
assert.equal(unknownPostingWords(parsePublishedReading({})), null);
const openReading = parsePublishedReading({
  posting_status: "open",
  posting_source: "Ventura County",
  generated_at: "2026-10-09T18:00:00Z",
  final_status: "Safe",
});
assert.equal(openReading.postingStatus, "open");
assert.equal(openReading.postingDate, "2026-10-09");
const openWords = openPostingWords(openReading) ?? "";
assert.match(openWords, /No active county postings today/);
assert.match(openWords, /Ventura County/);
assert.match(openWords, /October 9, 2026/);
assert.doesNotMatch(openWords, /safe/i);
assert.equal(officialPosting(parsePublishedReading({ posting_status: "warning" }))?.kind, "warning");
assert.equal(officialPosting(parsePublishedReading({ posting_status: "advisory" }))?.kind, "advisory");
assert.ok(rainAdvisoryWords(parsePublishedReading({ method: "rules", rain_advisory: true })));
assert.equal(rainAdvisoryWords(parsePublishedReading({ method: "rules", rain_advisory: false })), null);
assert.equal(rainAdvisoryWords(parsePublishedReading({ method: "model", recent_rain: true })), null);
assert.equal(rainAdvisoryWords(parsePublishedReading({ method: "rules" })), null);

const merged = mergeReadings(
  parsePublishedReading({ method: "rules", rain_advisory: false, posting_status: "advisory" }),
  parsePublishedReading({ method: "model", rain_advisory: true, confidence: "high", posting_source: "LA County" })
);
assert.equal(merged.method, "rules");
assert.equal(merged.rainAdvisory, false);
assert.equal(merged.confidence, "high");
assert.equal(merged.postingStatus, "advisory");
assert.equal(merged.postingSource, "LA County");

const daily = parseDailyStatus({
  generated_at: "2026-10-09T18:00:00Z",
  stations: [
    { station_code: "DHS114", method: "model", confidence: "low" },
    { station_code: "0", method: "pooled model", posting_status: "advisory", posting_source: "OC Health" },
    { station_code: "DHS114", posting_status: "closure", posting_source: "LA County" },
  ],
});
assert.equal(daily.generatedAt, "2026-10-09T18:00:00.000Z");
assert.equal(daily.readings.get("DHS114")?.postingStatus, "closure");
assert.equal(daily.readings.get("DHS114")?.method, null);
assert.equal(daily.readings.get("0")?.method, "pooled_model");
assert.equal(daily.readings.get("0")?.postingStatus, "advisory");
const ventura = parseDailyStatus({
  generated_at: "2026-10-10T15:00:00Z",
  stations: [{ station_code: "V1", posting_status: "open", posting_source: "Ventura County" }],
});
assert.equal(ventura.readings.get("V1")?.postingStatus, "open");
assert.equal(ventura.readings.get("V1")?.postingDate, "2026-10-10");
assert.equal(parseDailyStatus({}).readings.size, 0);
assert.equal(parseDailyStatus({}).indexes.size, 0);
assert.equal(parseDailyStatusRows([]).readings.size, 0);

const liveRow = parseDailyStatusRows([
  {
    station_code: "BDP12",
    generated_at: "2026-10-09T18:00:00Z",
    posting_status: "warning",
    posting_source: "Orange County Health Care Agency",
    posting_fetched_at: "2026-10-08T16:30:00Z",
    final_status: "",
    method: "model",
    confidence: "high",
    neptune_index: "",
    neptune_band: "",
  },
]);
const baby = liveRow.readings.get("BDP12");
assert.equal(baby?.postingStatus, "warning");
assert.equal(baby?.postingDate, "2026-10-08");
assert.equal(baby?.method, "model");
assert.equal(baby?.confidence, "high");
assert.equal(baby?.finalStatus, null);
assert.equal(officialPosting(baby)?.kind, "warning");
assert.equal(officialPosting(baby) ? postingLabel(officialPosting(baby)!) : null, "Warning");
assert.equal(liveRow.indexes.get("BDP12")?.index, null);
assert.equal(liveRow.indexes.get("BDP12")?.band, null);
const dailyIndex = parseDailyStatusRows([{ station_code: "X1", neptune_index: 42, neptune_band: "good" }]);
assert.equal(dailyIndex.indexes.get("X1")?.index, 42);
assert.equal(dailyIndex.indexes.get("X1")?.band, "good");
assert.equal(parseDailyStatus({}).rows.length, 0);
assert.equal(parseDailyStatus({}).agencyColumn, false);
assert.deepEqual(parseDailyStatus({}).duplicateCodes, []);

const splitAgency = parseDailyStatusRows([
  { station_code: "0", agency: "County A", posting_status: "warning" },
  { station_code: "0", agency: "County B", posting_status: "open" },
  { station_code: "0", agency: "County A", posting_status: "advisory" },
]);
assert.equal(splitAgency.agencyColumn, true);
assert.deepEqual(splitAgency.duplicateCodes, ["0"]);
assert.equal(splitAgency.readings.get("0"), undefined);
assert.equal(splitAgency.rows.length, 2);
assert.equal(
  matchDailyRow(splitAgency.rows, { code: "0", name: "North", county: "Orange", agency: "County A" }, true, 2)?.reading.postingStatus,
  "advisory"
);
assert.equal(
  matchDailyRow(splitAgency.rows, { code: "0", name: "South", county: "San Diego", agency: "County B" }, true, 2)?.reading.postingStatus,
  "open"
);

const splitName = parseDailyStatusRows([
  { station_code: "0", name: "Huntington State Beach", county: "Orange", posting_status: "warning" },
  { station_code: "0", name: "Silver Strand", county: "San Diego", posting_status: "open" },
]);
assert.equal(splitName.agencyColumn, false);
assert.equal(splitName.readings.get("0"), undefined);
assert.equal(splitName.rows.length, 2);
assert.equal(
  matchDailyRow(splitName.rows, { code: "0", name: "Huntington State Beach", county: "Orange", agency: null }, false, 2)?.reading.postingStatus,
  "warning"
);
assert.equal(
  matchDailyRow(splitName.rows, { code: "0", name: "Silver Strand", county: "San Diego", agency: null }, false, 2)?.reading.postingStatus,
  "open"
);

const repeatedBare = parseDailyStatusRows([
  { station_code: "0", posting_status: "warning" },
  { station_code: "0", posting_status: "open" },
]);
assert.equal(repeatedBare.rows.length, 1);
assert.equal(repeatedBare.readings.get("0")?.postingStatus, "open");
assert.equal(
  matchDailyRow(repeatedBare.rows, { code: "0", name: "Only", county: "Orange", agency: null }, false, 2),
  null
);
assert.equal(
  matchDailyRow(repeatedBare.rows, { code: "0", name: "Only", county: "Orange", agency: null }, false, 1)?.reading.postingStatus,
  "open"
);

const agencyRoster = parseRosterJson([{ station_code: "0", name: "North Beach", agency: "County Health", county: "Orange" }]);
assert.equal(agencyRoster[0]?.agency, "County Health");
assert.equal(agencyRoster[0]?.stationCode, "0");
assert.equal(parseRosterJson([{ station_code: "1", name: "South Beach" }])[0]?.agency, null);

const splitArchive = groupArchive(
  [
    parseArchiveRow({ station_code: "0", agency: "A", lead_days: 0, probability: 0.1, forecast_date: "2026-10-09", target_date: "2026-10-09" })!,
    parseArchiveRow({ station_code: "0", agency: "B", lead_days: 0, probability: 0.9, forecast_date: "2026-10-09", target_date: "2026-10-09" })!,
  ],
  true
);
assert.equal(splitArchive.size, 2);
assert.equal(splitArchive.get("0\0a")?.nowcast?.probability, 0.1);
assert.equal(splitArchive.get("0\0b")?.nowcast?.probability, 0.9);

const keyedDaily = parseDailyStatusRows([
  { station_code: "0", station_key: "oc-health-0", agency: "County Health", posting_status: "warning" },
  { station_code: "0", station_key: "sd-health-0", agency: "County Health", posting_status: "open" },
  { station_code: "0", station_key: "oc-health-0", agency: "County Health", posting_status: "advisory" },
]);
assert.equal(keyedDaily.rows.length, 2);
assert.equal(keyedDaily.readings.get("0"), undefined);
assert.ok(keyedDaily.duplicateCodes.includes("0"));
assert.equal(
  matchDailyRow(
    keyedDaily.rows,
    { code: "0", name: "North", county: "Orange", agency: "County Health", stationKey: "oc-health-0" },
    true,
    2
  )?.reading.postingStatus,
  "advisory"
);
assert.equal(
  matchDailyRow(
    keyedDaily.rows,
    { code: "0", name: "South", county: "San Diego", agency: "County Health", stationKey: "sd-health-0" },
    true,
    2
  )?.reading.postingStatus,
  "open"
);
assert.equal(
  matchDailyRow(
    keyedDaily.rows,
    { code: "0", name: "North", county: "Orange", agency: "County Health", stationKey: "missing-key" },
    true,
    2
  ),
  null
);
assert.equal(parseRosterJson([{ station_code: "0", name: "North", station_key: "oc-health-0", agency: "County Health" }])[0]?.stationKey, "oc-health-0");
assert.equal(parseRosterJson([{ station_code: "1", name: "South" }])[0]?.stationKey, null);
assert.equal(parseRosterJson([{ station_code: "2", name: "Zero", station_key: 0 }])[0]?.stationKey, "0");
assert.equal(parseRosterJson([{ station_code: "3", name: "Blank", station_key: "" }])[0]?.stationKey, null);
assert.equal(latestDatedStatusName(["notes.txt", "2026-10-01.csv", "2026-10-09.json", "2026-10-08.csv"]), "2026-10-09.json");
assert.equal(latestDatedStatusName(["readme.md"]), null);

const stale = parseStaleness({ default_days: 7, counties: { "Orange County": 14, "Los Angeles": 10 } });
assert.equal(staleLimitDays("Orange", stale), 14);
assert.equal(staleLimitDays("Ventura", stale), 7);
assert.equal(staleLimitDays("Ventura", null), null);

const regions = parseRegions({
  roster: "data/roster.json",
  regions: [{ name: "South Coast", counties: ["Los Angeles County", "Orange"] }],
});
assert.equal(regions.rosterPath, "data/roster.json");
assert.equal(regionForCounty("Los Angeles", regions.regions), "South Coast");
assert.equal(regionForCounty("San Diego", regions.regions), null);

const manifest = parseManifest({
  generated_at: "2026-10-09T15:00:00Z",
  model_version: "v2-test",
  stale_counties: ["Orange County"],
  checks_passed: false,
});
assert.equal(manifest.modelVersion, "v2-test");
assert.equal(manifest.checksPassed, false);
assert.deepEqual(manifest.staleCounties, ["Orange"]);

const indexed = parseArchiveRow({
  station_code: "DHS114",
  lead_days: 0,
  neptune_index: 126,
  neptune_band: "hazardous",
});
assert.ok(indexed);
assert.equal(indexed.neptuneIndex, 126);
assert.equal(indexed.neptuneBand, "hazardous");

const sampleScale = parseIndexBands(JSON.parse(readFileSync("data/neptune-v2/config/neptune_index_bands.json", "utf8")));
assert.ok(sampleScale);
assert.equal(sampleScale.scaleMin, 0);
assert.equal(sampleScale.scaleMax, 100);
assert.equal(sampleScale.higherIsBetter, true);
assert.equal(sampleScale.bands.find((band) => band.id === "good")?.min, 85);
assert.equal(sampleScale.bands.find((band) => band.id === "caution")?.min, 65);
assert.equal(sampleScale.bands.find((band) => band.id === "caution")?.max, 84);
assert.equal(sampleScale.bands.find((band) => band.id === "poor")?.max, 64);

const oldScore = resolveNeptuneDisplay(indexed.neptuneIndex, indexed.neptuneBand, sampleScale);
assert.equal(oldScore?.index, null);
assert.equal(oldScore?.bandId, "hazardous");
assert.equal(oldScore?.label, "Hazardous");

const alt = parseIndexBands({
  scale_min: 0,
  scale_max: 100,
  bands: [
    { id: "good", label: "Good", min: 80, max: 100 },
    { id: "caution", label: "Caution", min: 50, max: 79 },
    { id: "poor", label: "Poor", min: 0, max: 49 },
  ],
  tiers: {
    limited_data: [
      { id: "good", label: "Good", min: 95, max: 100 },
      { id: "poor", label: "Poor", min: 0, max: 94 },
    ],
  },
});
assert.ok(alt);
assert.equal(bandForValue(82, alt.bands)?.id, "good");
assert.equal(bandForValue(60, alt.bands)?.id, "caution");
assert.equal(resolveNeptuneDisplay(90, null, alt, { tier: "limited_data" })?.bandId, "poor");
assert.equal(resolveNeptuneDisplay(90, null, alt, { tier: "model_pool" })?.bandId, "good");
assert.equal(resolveNeptuneDisplay(90, "poor", alt)?.bandId, "poor");
assert.equal(resolveNeptuneDisplay(90, "poor", alt)?.index, 90);
assert.equal(resolveNeptuneDisplay(92, null, null)?.bandId, null);
assert.equal(resolveNeptuneDisplay(92, null, null)?.index, 92);
assert.match(indexScalePhrase(resolveNeptuneDisplay(92, null, null)!, "en") ?? "", /higher is cleaner/);
assert.equal(resolveNeptuneDisplay(null, null, alt), null);
assert.equal(resolveNeptuneDisplay(null, null, alt, { postingStatus: "closure" }), null);
const forced = resolveNeptuneDisplay(90, "good", alt, { postingStatus: "warning" });
assert.equal(forced?.bandId, "poor");
assert.equal(forced?.forcedByPosting, true);
assert.equal(forced?.countsAsPoor, false);
assert.equal(resolveNeptuneDisplay(90, "good", alt, { postingStatus: "advisory" })?.bandId, "good");
assert.equal(resolveNeptuneDisplay(90, "good", alt, { postingStatus: "open" })?.bandId, "good");
assert.equal(parseNeptuneBandId("Unhealthy for swimming"), "unhealthy_for_swimming");
const bandOnly = resolveNeptuneDisplay(null, parseNeptuneBandId("Unhealthy for swimming"), alt);
assert.equal(bandOnly?.index, null);
assert.equal(bandOnly?.bandId, "unhealthy_for_swimming");
assert.equal(bandOnly?.label, "Unhealthy for Swimming");
assert.equal(resolveNeptuneDisplay(900, "good", alt)?.index, null);
assert.equal(resolveNeptuneDisplay(900, "good", alt)?.bandId, "good");
assert.equal(resolveNeptuneDisplay(900, "not-a-band", alt)?.bandId, "not_a_band");
assert.equal(resolveNeptuneDisplay(null, null, alt), null);
assert.deepEqual(readNeptuneFields({ probability: 0.4 }), { index: null, band: null });
const lowered = resolveNeptuneDisplay(90, "good", alt, { daysSinceSample: 12 });
assert.equal(lowered?.lowered, true);
assert.match(indexConfidenceNote(lowered!, "en") ?? "", /last lab test 12 days ago/);
assert.match(indexConfidenceNote(lowered!, "es") ?? "", /hace 12 días/);
const both = resolveNeptuneDisplay(90, "good", alt, { daysSinceSample: 12, fallbackUsed: true });
assert.match(indexConfidenceNote(both!, "en") ?? "", /12 days ago/);
assert.match(indexConfidenceNote(both!, "en") ?? "", /fallback/);
assert.equal(resolveNeptuneDisplay(90, "good", alt, { daysSinceSample: 2 })?.lowered, false);
assert.equal(displayBandLabel(resolveNeptuneDisplay(90, "good", alt)!, "es"), "Bueno");
assert.equal(displayBandLabel(resolveNeptuneDisplay(90, "caution", alt)!, "es"), "Precaución");
assert.equal(displayBandLabel(resolveNeptuneDisplay(20, "poor", alt)!, "es"), "Mala");
const byTier = parseIndexBands({ by_tier: { model_pool: [{ id: "poor", min: 0, max: 40 }, { id: "good", min: 41, max: 100 }] } });
assert.equal(byTier?.tiers.model_pool?.[0]?.id, "poor");
assert.equal(parseIndexBands({}), null);
assert.equal(parseIndexBands({ bands: [] }), null);

function contrast(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  };
  const a = lum(hexA);
  const b = lum(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
for (const bandId of ["good", "caution", "poor"] as const) {
  const shown = resolveNeptuneDisplay(bandId === "poor" ? 10 : bandId === "caution" ? 60 : 90, bandId, alt);
  assert.ok(shown);
  assert.ok(contrast(shown.color, shown.textColor) >= 4.5, `${bandId} badge contrast`);
  assert.ok(contrast(shown.surface, shown.surfaceText) >= 4.5, `${bandId} card contrast`);
}
const grey = resolveNeptuneDisplay(90, "good", alt, { fallbackUsed: true });
assert.ok(grey);
assert.ok(contrast(grey.color, grey.textColor) >= 4.5, "lowered badge contrast");
assert.match(indexConfidenceNote(grey, "en") ?? "", /fallback/);

assert.equal(parseLeadMaturity("go_live"), "go_live");
assert.equal(parseLeadMaturity("Go-Live"), "go_live");
assert.equal(parseLeadMaturity("experimental"), "experimental");
assert.equal(parseLeadMaturity("high"), null);
assert.equal(parseLeadMaturity(0.8), null);
assert.equal(parseLeadMaturity(true), "go_live");
assert.equal(parseMethod("pooled_model"), "pooled_model");
assert.equal(selectDailySource({ hasCurrent: true, statusPresent: true, statusIsLead: true }), "current");
assert.equal(selectDailySource({ hasCurrent: false, statusPresent: true, statusIsLead: true }), "leads");
assert.equal(selectDailySource({ hasCurrent: false, statusPresent: true, statusIsLead: false }), "legacy-status");
assert.equal(selectDailySource({ hasCurrent: false, statusPresent: false, statusIsLead: false }), "history");
assert.equal(hasLeadColumn([{ station_code: "0", lead_days: "" }]), true);
assert.equal(hasLeadColumn([{ station_code: "0", method: "model" }]), false);

const leadRows = [
  { station_code: "0", agency: "Orange County", lead_days: 0, method: "pooled_model", confidence: "low", posting_status: "warning", day0_release: "go_live", day1_release: "go_live" },
  { station_code: "0", agency: "San Diego County", lead_days: 0, method: "rules", confidence: "high" },
  { station_code: "0", agency: "Orange County", lead_days: 1, method: "model", confidence: "medium", go_live: "go_live", day1_release: "go_live" },
  { station_code: "0", agency: "Orange County", lead_days: 2, method: "model", confidence: "high", day_confidence: "go_live", release: "experimental", day2_release: "experimental" },
  { station_code: "0", agency: "Orange County", lead_days: 1, method: "rules", confidence: "low", go_live: "experimental", day1_release: "experimental" },
  { station_code: "DHS114", lead: 4, method: "model" },
];
assert.equal(hasLeadColumn(leadRows), true);
const leads = parseLeadStatusRows(leadRows);
assert.equal(leads.agencyColumn, true);
assert.equal(leads.rows.length, 5);
const orange = matchLeadRows(
  leads.rows,
  { code: "0", name: "Huntington", county: "Orange", agency: "Orange County", stationKey: null },
  true,
  2
);
assert.equal(orange.find((row) => row.lead === 0)?.reading.method, "pooled_model");
assert.equal(orange.find((row) => row.lead === 0)?.reading.confidence, "low");
assert.equal(orange.find((row) => row.lead === 0)?.reading.postingStatus, "warning");
assert.equal(orange.find((row) => row.lead === 1)?.reading.method, "rules");
assert.equal(orange.find((row) => row.lead === 0)?.maturity, "go_live");
assert.equal(orange.find((row) => row.lead === 0)?.releases[1], "go_live");
assert.equal(orange.find((row) => row.lead === 1)?.maturity, "experimental");
assert.equal(orange.find((row) => row.lead === 2)?.maturity, "experimental");
assert.equal(orange.find((row) => row.lead === 3), undefined);
assert.equal(forecastRelease(null, orange, 1), "experimental");
assert.equal(forecastRelease(null, orange, 2), "experimental");
assert.equal(forecastRelease([null, "go_live", null, null], orange, 1), "go_live");
assert.equal(
  forecastRelease([null, "experimental", null, null], [{ lead: 1, maturity: "go_live", releases: [null, "go_live", null, null] }], 1),
  "experimental"
);
assert.equal(
  forecastRelease([null, null, null, null], [{ lead: 1, maturity: "go_live", releases: [null, "go_live", null, null] }], 1),
  "go_live"
);
assert.equal(
  forecastRelease(null, [
    { lead: 0, maturity: "go_live", releases: ["go_live", "go_live", null, null] },
    { lead: 1, maturity: null, releases: [null, null, null, null] },
  ], 1),
  "go_live"
);
assert.equal(forecastRelease([null, null, null, "go_live"], orange, 3), "go_live");
const sanDiego = matchLeadRows(
  leads.rows,
  { code: "0", name: "Silver Strand", county: "San Diego", agency: "San Diego County", stationKey: null },
  true,
  2
);
assert.equal(sanDiego.find((row) => row.lead === 0)?.reading.method, "rules");
assert.equal(sanDiego.find((row) => row.lead === 1), undefined);
assert.deepEqual(leadZeroSourceRows(leadRows).map((row) => row.agency), ["Orange County", "San Diego County"]);
assert.equal(leadRelease({ day1_confidence: "go_live", day2_confidence: "experimental", day3_confidence: "high" }, 1), null);
assert.equal(leadRelease({ day1_confidence: "go_live", day2_confidence: "experimental", day3_confidence: "high" }, 2), null);
assert.equal(leadRelease({ day1_confidence: "go_live", day2_confidence: "experimental", day3_confidence: "high" }, 3), null);
assert.equal(leadRelease({ day1_go_live: "go_live" }, 1), null);
assert.equal(leadRelease({ day1_release: "go_live", day1_confidence: "experimental" }, 1), "go_live");
assert.equal(leadRelease({ day2GoLive: "experimental" }, 2), null);
assert.equal(leadRelease({ day2Release: "experimental" }, 2), "experimental");
assert.equal(leadRelease({ day0_release: "go_live" }, 0), "go_live");
assert.equal(leadRelease({ "day3-release": "go_live" }, 3), "go_live");
assert.equal(leadRelease({ day1_status: "go_live", day1_release_status: "go_live" }, 1), null);
assert.equal(leadRelease({ day1_release: "" }, 1), null);
assert.equal(leadRelease({}, 1), null);
assert.equal(leadRelease({ day1_release: "go_live" }, 4), null);
assert.deepEqual(dayReleasesFromRow({ day0_release: "experimental", day1_release: "go_live", day2_go_live: "go_live" }), ["experimental", "go_live", null, null]);
const confidenceOnly = parseLeadStatusRows([
  { station_code: "A", lead_days: 1, confidence: "high", day_confidence: "go_live", lead_confidence: "experimental" },
]);
assert.equal(confidenceOnly.rows[0]?.maturity, null);
assert.equal(
  parseLeadStatusRows([{ station_code: "A", lead_days: 1, release_status: "go_live", go_live: "go_live", maturity: "go_live" }]).rows[0]?.maturity,
  null
);
assert.equal(parseLeadStatusRows([{ station_code: "A", lead_days: 1, day1_release: "go_live", day2_release: "experimental" }]).rows[0]?.maturity, "go_live");
assert.equal(parseLeadStatusRows([{ station_code: "A", lead_days: 1, day1_release: "go_live", day2_release: "experimental" }]).rows[0]?.releases[2], "experimental");
const currentRelease = parseDailyStatusRows([
  {
    station_code: "DHS114",
    day0_release: "go_live",
    day1_release: "go_live",
    day2Release: "experimental",
    "day3-release": "go_live",
    day1_confidence: "go_live",
    day1_go_live: "go_live",
  },
]);
assert.deepEqual(currentRelease.rows[0]?.releases, ["go_live", "go_live", "experimental", "go_live"]);

const preferred = mergeReadings(
  { method: "pooled_model", confidence: "low", postingStatus: null, postingSource: null, finalStatus: null, postingDate: null, rainAdvisory: null },
  parsePublishedReading({ method: "model", confidence: "high", posting_status: "warning", posting_source: "OC" })
);
assert.equal(preferred.method, "pooled_model");
assert.equal(preferred.confidence, "low");
assert.equal(preferred.postingStatus, "warning");
assert.equal(preferred.postingSource, "OC");
const fallbackReading = mergeReadings(
  { method: null, confidence: null, postingStatus: null, postingSource: null, finalStatus: null, postingDate: null, rainAdvisory: null },
  parsePublishedReading({ method: "rules", confidence: "medium", posting_status: "open" })
);
assert.equal(fallbackReading.method, "rules");
assert.equal(fallbackReading.confidence, "medium");
assert.equal(fallbackReading.postingStatus, "open");

console.log("neptune contract checks passed");
