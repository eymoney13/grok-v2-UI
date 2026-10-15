import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  groupArchive,
  ceilingForTier,
  parseArchiveRow,
  parseCalibrationCeilings,
  parseManifest,
  parseRegions,
  parseRosterJson,
  parseStaleness,
  regionForCounty,
  staleLimitDays,
  latestDatedStatusName,
  locationUnknownFromRow,
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
import { resolvePublishedCall, statusForPublishedCall } from "../lib/data.ts";
import {
  fetchNeptuneV2Snapshot,
  formatRemoteErrors,
  githubContentsUrl,
  rawGithubUrl,
} from "../lib/neptuneRemote.ts";
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
  postingHeadline,
  postingLabel,
  rainAdvisoryWords,
  unknownPostingWords,
} from "../lib/publishedReading.ts";
import {
  bandForValue,
  ceilingPhrase,
  displayBandLabel,
  detectPublishedScale,
  indexConfidenceNote,
  indexReading,
  chooseIndexValue,
  indexScaleMode,
  indexScalePhrase,
  overrideReasonPhrase,
  parseBandOverrideReason,
  parseIndexBands,
  parseNeptuneBandId,
  readNeptuneFields,
  resolveNeptuneDisplay,
  scoreFromProbability,
  swimWords,
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
assert.equal(unknownClosure ? postingLabel(unknownClosure) : null, "Closed");
assert.deepEqual(unknownClosure ? postingHeadline(unknownClosure) : null, { title: "Closed", detail: null });
assert.deepEqual(closed ? postingHeadline(closed) : null, { title: "Closed", detail: "Beach closed" });
assert.equal(officialPosting(parsePublishedReading({ posting_status: "closure", final_status: "Beach closed" }))?.detail, "Beach closed");
assert.equal(statusForPublishedCall("Normal", "Unsafe"), "Not recommended");
assert.equal(statusForPublishedCall("Not recommended", "Safe"), "Normal");
assert.equal(statusForPublishedCall("Slightly elevated", "Safe"), "Slightly elevated");
assert.equal(statusForPublishedCall("Normal", "Unknown"), "Normal");
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
assert.deepEqual(manifest.notForDisplay, []);
const hiddenColumns = parseManifest({
  not_for_display: ["alert_flag", "day1_call", "day2_call", "day3_call"],
});
assert.deepEqual(hiddenColumns.notForDisplay, ["alert_flag", "day1_call", "day2_call", "day3_call"]);
const hiddenNested = parseManifest({ stats: { not_for_display: ["alert_flag"] } });
assert.deepEqual(hiddenNested.notForDisplay, ["alert_flag"]);

const manifestNested = parseManifest({
  stats: {
    generated_at: "2026-10-11T12:00:00Z",
    model_version: "nested",
    checks_passed: true,
    stale_counties: "Ventura County, San Diego",
  },
});
assert.equal(manifestNested.modelVersion, "nested");
assert.equal(manifestNested.checksPassed, true);
assert.equal(manifestNested.generatedAt, "2026-10-11T12:00:00.000Z");
assert.deepEqual(manifestNested.staleCounties, ["Ventura", "San Diego"]);

const manifestObjects = parseManifest({
  stale_counties: [
    { county: "Orange County", stale: true },
    { county: "Los Angeles", stale: false },
    { name: "San Diego County", flagged: "false" },
    { county: "Ventura", is_stale: 1 },
    { county: "Santa Barbara", stale: 0 },
  ],
});
assert.deepEqual(manifestObjects.staleCounties, ["Orange", "Ventura"]);

const unknownDaily = parseDailyStatusRows([
  {
    station_key: "VCEHD|1100",
    station_code: "1100",
    call: "Unknown",
    probability: "",
    final_status: "Unknown",
  },
]);
const unknownBeach = unknownDaily.rows.find((row) => row.stationKey === "VCEHD|1100");
assert.ok(unknownBeach);
assert.equal(unknownBeach.code, "1100");
assert.equal(unknownBeach.call, "Unknown");
assert.equal(unknownBeach.probability, null);
assert.equal(unknownBeach.calibratedProbability, null);
assert.equal(unknownBeach.predictionDate, null);
assert.equal(unknownBeach.reading.finalStatus, "Unknown");
assert.equal(officialPosting(unknownBeach.reading), null);
assert.equal(isUnknownCall(unknownBeach.call), true);
assert.equal(isUnknownCall(unknownBeach.reading.finalStatus), true);

const finalStatusOnly = parseDailyStatusRows([{ station_code: "U2", final_status: "Unknown" }]);
assert.equal(finalStatusOnly.rows[0]?.call, null);
assert.equal(finalStatusOnly.rows[0]?.probability, null);
assert.equal(finalStatusOnly.rows[0]?.reading.finalStatus, "Unknown");

const filledDaily = parseDailyStatusRows([
  {
    station_code: "P1",
    call: "Unsafe",
    probability: 0.62,
    prediction_date: "2026-10-11",
    calibrated_probability: 0.4,
  },
]);
assert.equal(filledDaily.rows[0]?.call, "Unsafe");
const alertFlag = parseDailyStatusRows([
  {
    station_code: "L1",
    tier: "limited_data",
    alert_flag: "Unsafe",
    nowcast_probability: 1,
    neptune_index: "",
    neptune_band: "",
  },
]);
assert.equal(alertFlag.rows[0]?.call, "Unsafe");
assert.equal(alertFlag.rows[0]?.probability, 1);
assert.equal(alertFlag.rows[0]?.index.index, null);
assert.equal(filledDaily.rows[0]?.probability, 0.62);
assert.equal(filledDaily.rows[0]?.predictionDate, "2026-10-11");
assert.equal(filledDaily.rows[0]?.calibratedProbability, 0.4);

const wideCurrent = parseDailyStatusRows([
  {
    station_key: "DH|DHS113",
    station_code: "DHS113",
    nowcast_call: "Safe",
    nowcast_probability: 0.023428,
    day0_calibrated_probability: 0.02,
    day1_call: "Unsafe",
    day1_probability: 0.189091,
    day1_release: "go_live",
    day2_release: "go_live",
    day3_release: "go_live",
    generated_at: "2026-10-10T14:56:12Z",
    last_result_mpn: 20,
    last_sample_age_days: 3,
    method: "model",
    confidence: "high",
  },
]);
const manhattan = wideCurrent.rows[0];
assert.ok(manhattan);
assert.equal(manhattan.call, "Safe");
assert.equal(manhattan.probability, 0.023428);
assert.equal(manhattan.calibratedProbability, 0.02);
assert.equal(manhattan.predictionDate, "2026-10-10");
assert.equal(manhattan.lastResultMpn, 20);
assert.equal(manhattan.lastSampleAgeDays, 3);
assert.equal(manhattan.horizons[1]?.call, "Unsafe");
assert.equal(manhattan.horizons[1]?.probability, 0.189091);
assert.equal(manhattan.releases[1], "go_live");
assert.equal(manhattan.releases[3], "go_live");

const blankUnknown = parseDailyStatusRows([
  {
    station_key: "VCEHD|1100",
    station_code: "1100",
    nowcast_call: "Unknown",
    nowcast_probability: "",
    final_status: "Unknown",
    day1_call: "Unknown",
    day1_probability: "",
    posting_status: "open",
  },
]);
const crescent = blankUnknown.rows.find((row) => row.stationKey === "VCEHD|1100");
assert.ok(crescent);
assert.equal(crescent.call, "Unknown");
assert.equal(crescent.probability, null);
assert.equal(crescent.horizons[1]?.probability, null);
assert.equal(crescent.horizons[1]?.call, "Unknown");
assert.equal(isUnknownCall(crescent.call), true);
assert.equal(officialPosting(crescent.reading), null);

const publishedManifest = parseManifest({
  generated_at: "2026-10-10T14:56:12Z",
  stale_counties: [
    { county: "Humboldt", gap_type: "loader behind source" },
    { county: "Monterey", gap_type: "source stale" },
    { county: "Orange", gap_type: "source stale" },
    { county: "San Francisco", gap_type: "source stale" },
  ],
  coordinate_flags: [{ station_key: "VCEHD|1100", reason: "county_mismatch", lat: 42.114, lon: -124.45 }],
});
assert.deepEqual(publishedManifest.staleCounties, ["Humboldt", "Monterey", "Orange", "San Francisco"]);
assert.deepEqual(publishedManifest.coordinateFlags, ["VCEHD|1100"]);

const publishedStale = parseStaleness({
  minimum_days: 14,
  counties: { Humboldt: { threshold_days: 22 }, Orange: { threshold_days: 21 } },
});
assert.equal(publishedStale.defaultDays, 14);
assert.equal(staleLimitDays("Humboldt", publishedStale), 22);
assert.equal(staleLimitDays("Orange", publishedStale), 21);
assert.equal(staleLimitDays("Ventura", publishedStale), 14);

const minIndex = parseIndexBands({
  default: [
    { band: "Poor", min_index: 0 },
    { band: "Caution", min_index: 85 },
    { band: "Good", min_index: 98 },
  ],
  by_tier: {
    limited_data: [
      { band: "Poor", min_index: 0 },
      { band: "Good", min_index: 95 },
    ],
  },
});
assert.equal(minIndex?.bands.find((band) => band.id === "poor")?.max, 84);
assert.equal(minIndex?.bands.find((band) => band.id === "caution")?.min, 85);
assert.equal(minIndex?.bands.find((band) => band.id === "caution")?.max, 97);
assert.equal(minIndex?.bands.find((band) => band.id === "good")?.min, 98);
assert.equal(minIndex?.tiers.limited_data?.find((band) => band.id === "poor")?.max, 94);
assert.equal(minIndex?.tiers.limited_data?.some((band) => band.id === "caution"), false);

function mockFetch(routes: Record<string, { status: number; body: string }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = routes[url];
    if (!hit) return new Response("missing", { status: 404 });
    return new Response(hit.body, { status: hit.status });
  }) as typeof fetch;
}

const currentRaw = rawGithubUrl("outputs/daily/current.csv");
const rosterRaw = rawGithubUrl("data/roster.json");
const currentApi = githubContentsUrl("outputs/daily/current.csv");
const rosterApi = githubContentsUrl("data/roster.json");
const manifestApi = githubContentsUrl("outputs/run_manifest.json");
const bandsApi = githubContentsUrl("config/neptune_index_bands.json");
const staleApi = githubContentsUrl("config/staleness_thresholds.json");

const viaApi = await fetchNeptuneV2Snapshot({
  token: null,
  fetchImpl: mockFetch({
    [currentRaw]: { status: 404, body: "404: Not Found" },
    [currentApi]: { status: 200, body: "station_code,call\n1100,Unknown\n" },
    [rosterApi]: { status: 200, body: "[]" },
    [manifestApi]: { status: 404, body: "Not Found" },
    [bandsApi]: { status: 200, body: "{}" },
    [staleApi]: { status: 200, body: "{}" },
  }),
});
assert.equal(viaApi.ok, true);
assert.equal(viaApi.method, "api");
assert.match(viaApi.files["outputs/daily/current.csv"] ?? "", /Unknown/);
assert.equal(viaApi.files["data/roster.json"], "[]");
assert.equal(viaApi.files["outputs/run_manifest.json"], undefined);
assert.ok(viaApi.errors.some((error) => error.method === "raw" && error.status === 404));

const bothMissing = await fetchNeptuneV2Snapshot({
  token: null,
  fetchImpl: mockFetch({
    [currentRaw]: { status: 404, body: "404: Not Found" },
    [rosterRaw]: { status: 404, body: "404: Not Found" },
    [currentApi]: { status: 404, body: '{"message":"Not Found","status":"404"}' },
  }),
});
assert.equal(bothMissing.ok, false);
assert.equal(bothMissing.method, null);
assert.deepEqual(bothMissing.files, {});
assert.match(formatRemoteErrors(bothMissing), /raw .*current\.csv → HTTP 404: 404: Not Found/);
assert.match(formatRemoteErrors(bothMissing), /api .*current\.csv\?ref=main → HTTP 404/);

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
assert.equal(sampleScale.higherIsBetter, false);
assert.equal(sampleScale.bands.length, 4);
assert.equal(sampleScale.formula?.input, "calibrated_probability");
assert.equal(sampleScale.formula?.fallbackInput, null);
assert.equal(sampleScale.formula?.multiply, 100);
assert.equal(sampleScale.formula?.round, "nearest");
assert.equal(sampleScale.detection.tolerance, 1);
assert.equal(sampleScale.detection.minimumRows, 20);
assert.equal(sampleScale.detection.minimumFraction, 0.8);
assert.equal(sampleScale.bands.find((band) => band.id === "good")?.max, 24);
assert.equal(sampleScale.bands.find((band) => band.id === "moderate")?.min, 25);
assert.equal(sampleScale.bands.find((band) => band.id === "likely_unsafe")?.min, 50);
assert.equal(sampleScale.bands.find((band) => band.id === "likely_unsafe")?.countsAsUnsafe, true);
assert.equal(sampleScale.bands.find((band) => band.id === "very_likely_unsafe")?.min, 75);
assert.equal(sampleScale.bands.find((band) => band.id === "good")?.countsAsUnsafe, false);
assert.equal(scoreFromProbability({ calibrated_probability: 0.023, probability: 0.9 }, sampleScale.formula!), 2);
assert.equal(scoreFromProbability({ calibrated_probability: null, probability: 0.504 }, sampleScale.formula!), null);
const objectFormula = parseIndexBands({
  higher_is_better: false,
  bands: [{ band: "Good", min: 0, max: 100 }],
  formula: { input: "calibrated_probability", fallback_input: "probability", multiply: 100, round: "nearest" },
});
assert.equal(objectFormula?.higherIsBetter, false);
assert.equal(objectFormula?.formula?.fallbackInput, "probability");
assert.equal(scoreFromProbability({ calibrated_probability: null, probability: 0.504 }, objectFormula!.formula!), 50);
const proseDirection = parseIndexBands({
  scale_direction: "lower_is_cleaner",
  formula: "neptune_index = round(100 * calibrated exceedance probability), clipped to 0-100.",
  bands: [
    { band: "Good", min_index: 0, max_index: 24 },
    { band: "Very Likely Unsafe", min_index: 75, max_index: 100 },
  ],
});
assert.equal(proseDirection?.higherIsBetter, false);
assert.equal(proseDirection?.formula?.multiply, 100);
assert.equal(proseDirection?.formula?.fallbackInput, null);
assert.equal(
  detectPublishedScale(Array.from({ length: 20 }, () => ({ published: 2, computed: 2 })), sampleScale.detection),
  "published"
);
assert.equal(
  detectPublishedScale(Array.from({ length: 20 }, () => ({ published: 98, computed: 2 })), sampleScale.detection),
  "formula"
);
assert.equal(
  indexScaleMode(
    Array.from({ length: 20 }, () => ({ published: 98, calibrated: 0.02, probability: 0.02 })),
    sampleScale
  ),
  "formula"
);
const limitedFallback = chooseIndexValue(
  { index: null, band: null },
  { calibrated: null, probability: 1 },
  sampleScale,
  "formula",
  "limited_data"
);
assert.equal(limitedFallback.forecastPending, true);
assert.equal(limitedFallback.index, null);
assert.equal(limitedFallback.band, null);
const limitedOldScale = chooseIndexValue(
  { index: 98, band: "Good" },
  { calibrated: null, probability: 1 },
  sampleScale,
  "formula",
  "limited_data"
);
assert.equal(limitedOldScale.forecastPending, true);
assert.equal(limitedOldScale.index, null);
const wellTestedFallback = chooseIndexValue(
  { index: null, band: null },
  { calibrated: 0.023, probability: 1 },
  sampleScale,
  "formula",
  "model_pool"
);
assert.equal(wellTestedFallback.forecastPending, false);
assert.equal(wellTestedFallback.index, 2);
const publishedLimited = chooseIndexValue(
  { index: 26, band: "Moderate" },
  { calibrated: null, probability: 1 },
  sampleScale,
  "published",
  "limited_data"
);
assert.equal(publishedLimited.forecastPending, false);
assert.equal(publishedLimited.index, 26);
assert.equal(publishedLimited.band, "Moderate");
const limitedMatchingRow = chooseIndexValue(
  { index: 26, band: "Moderate" },
  { calibrated: 0.26, probability: 1 },
  sampleScale,
  "formula",
  "limited_data"
);
assert.equal(limitedMatchingRow.forecastPending, false);
assert.equal(limitedMatchingRow.index, 26);
assert.equal(limitedMatchingRow.band, "Moderate");
const blankProbability = chooseIndexValue(
  { index: null, band: null },
  { calibrated: null, probability: null },
  sampleScale,
  "formula",
  "model_pool"
);
assert.equal(blankProbability.forecastPending, true);
assert.equal(blankProbability.index, null);
assert.equal(blankProbability.band, null);
const blankBesideOld = chooseIndexValue(
  { index: 98, band: "Good" },
  { calibrated: null, probability: null },
  sampleScale,
  "formula",
  "model_pool"
);
assert.equal(blankBesideOld.forecastPending, true);
assert.equal(blankBesideOld.index, null);
const blankLimited = chooseIndexValue(
  { index: null, band: null },
  { calibrated: null, probability: null },
  sampleScale,
  "published",
  "limited_data"
);
assert.equal(blankLimited.forecastPending, true);
assert.equal(blankLimited.index, null);
assert.equal(resolveNeptuneDisplay(10, null, sampleScale, { tier: "model_pool" })?.bandId, "good");
assert.equal(resolveNeptuneDisplay(10, null, sampleScale, { tier: "limited_data" })?.bandId, "good");
assert.equal(resolveNeptuneDisplay(30, null, sampleScale)?.bandId, "moderate");
assert.equal(resolveNeptuneDisplay(60, null, sampleScale)?.bandId, "likely_unsafe");
assert.equal(resolveNeptuneDisplay(92, null, sampleScale, { tier: "model_pool" })?.bandId, "very_likely_unsafe");
assert.equal(resolveNeptuneDisplay(92, null, sampleScale, { tier: "limited_data" })?.bandId, "very_likely_unsafe");
assert.equal(resolveNeptuneDisplay(92, null, sampleScale)?.countsAsPoor, true);
assert.equal(resolveNeptuneDisplay(10, null, sampleScale)?.countsAsPoor, false);
assert.equal(swimWords("good", "en"), "Safe to swim");
assert.equal(swimWords("moderate", "en"), "Use caution");
assert.equal(swimWords("likely_unsafe", "en"), "Not safe");
assert.equal(swimWords("very_likely_unsafe", "es"), "No es seguro");
const rulesScore = resolveNeptuneDisplay(10, null, sampleScale, { tier: "model_pool", method: "rules" });
assert.equal(rulesScore?.bandId, "good");
assert.equal(rulesScore?.index, 10);
assert.equal(rulesScore?.bands.length, 4);
const posted = resolveNeptuneDisplay(2, "good", sampleScale, { overrideReason: "posted_warning" });
assert.equal(posted?.bandId, "very_likely_unsafe");
assert.equal(posted?.index, 2);
assert.equal(posted?.overrideReason, "posted_warning");
assert.equal(overrideReasonPhrase(posted?.overrideReason, "en"), "The county has posted a warning for this beach");
assert.equal(overrideReasonPhrase("closure", "en"), "This beach is closed");
const closedByPosting = resolveNeptuneDisplay(2, "good", sampleScale, { postingStatus: "closure" });
assert.equal(closedByPosting?.bandId, "very_likely_unsafe");
assert.equal(closedByPosting?.index, 2);
assert.equal(closedByPosting?.overrideReason, "closure");
assert.equal(parseBandOverrideReason("posted_warning"), "posted_warning");
assert.equal(parseBandOverrideReason("closure"), "closure");
assert.equal(parseBandOverrideReason(""), null);
assert.equal(parseBandOverrideReason("warning"), null);
assert.equal(
  readNeptuneFields({ neptune_index: 2, neptune_band: "Good", band_override_reason: "posted_warning" }).overrideReason,
  "posted_warning"
);
const archiveOverride = parseArchiveRow({
  station_code: "BDP12",
  neptune_index: 2,
  neptune_band: "Good",
  probability: 0.02,
  band_override_reason: "closure",
});
assert.equal(archiveOverride?.neptuneOverrideReason, "closure");
assert.equal(archiveOverride?.neptuneIndex, 2);
const ceilingsFile = parseCalibrationCeilings(
  JSON.parse(readFileSync("data/neptune-v2/config/calibration_ceilings.json", "utf8"))
);
assert.deepEqual(ceilingsFile.groups, {});
assert.equal(ceilingsFile.byTier.limited_data, 26);
assert.equal(ceilingsFile.byTier.model_pool, 100);
assert.equal(ceilingForTier(ceilingsFile, "limited_data"), 26);
assert.equal(ceilingForTier(ceilingsFile, "model_pool"), 100);
const nestedCeiling = parseCalibrationCeilings({
  source: "models/tier_calibrators.json",
  tiers: {
    limited_data: { method: "isotonic", max_calibrated_probability: 0.2558139534883721, max_index: 26 },
    model_pool: { method: "identity", max_calibrated_probability: 1, max_index: 100 },
  },
  groups: {},
});
assert.equal(nestedCeiling.byTier.limited_data, 26);
assert.equal(nestedCeiling.byTier.model_pool, 100);
assert.deepEqual(nestedCeiling.groups, {});
assert.equal(
  ceilingPhrase(ceilingsFile.byTier.limited_data, "en"),
  `This index can't go above ${ceilingsFile.byTier.limited_data} yet.`
);
const wrappedCeilings = parseCalibrationCeilings({
  generated_at: "2026-10-15T00:00:00Z",
  roster_row_count: 680,
  calibration_ceilings: {
    limited_data: ceilingsFile.byTier.limited_data,
    model_pool: ceilingsFile.byTier.model_pool,
    groups: {},
  },
});
assert.deepEqual(wrappedCeilings, ceilingsFile);
assert.equal(
  ceilingForTier(
    parseCalibrationCeilings({
      generated_at: "2026-10-10T14:56:12Z",
      tiers: { model_pool: 182, limited_data: 497 },
      calibration_ceilings: {
        limited_data: ceilingsFile.byTier.limited_data,
        model_pool: ceilingsFile.byTier.model_pool,
        groups: {},
      },
    }),
    "limited_data"
  ),
  ceilingsFile.byTier.limited_data
);
assert.deepEqual(parseCalibrationCeilings({ roster_row_count: 679, runtime_seconds: 20, tiers: { limited_data: 497 } }).byTier, {});
const capped = resolveNeptuneDisplay(10, "good", sampleScale, {
  tier: "limited_data",
  ceiling: ceilingsFile.byTier.limited_data,
});
assert.equal(capped?.index, 10);
assert.equal(capped?.ceiling, ceilingsFile.byTier.limited_data);
assert.equal(
  resolveNeptuneDisplay(10, "good", sampleScale, { ceiling: ceilingsFile.byTier.model_pool })?.ceiling,
  null
);
assert.equal(resolveNeptuneDisplay(92, "good", sampleScale, { tier: "model_pool", method: "rules" })?.bandId, "very_likely_unsafe");
assert.equal(
  resolveNeptuneDisplay(10, null, sampleScale, { tier: "model_pool", method: "rules", postingStatus: "warning" })?.bandId,
  "very_likely_unsafe"
);
const warnedGood = resolveNeptuneDisplay(2, null, sampleScale, { postingStatus: "warning" });
assert.equal(warnedGood?.bandId, "very_likely_unsafe");
assert.equal(warnedGood?.forcedByPosting, true);
assert.equal(warnedGood?.countsAsPoor, false);
const labScore = resolveNeptuneDisplay(2, null, sampleScale, { labOverLimit: true });
assert.equal(labScore?.bandId, "good");
assert.equal(labScore?.labOverride, true);
assert.equal(indexReading(labScore!, "en").label, "Over the limit");
assert.equal(indexReading(labScore!, "en").plain, "Over the limit");
const liveRoster = parseRosterJson(JSON.parse(readFileSync("data/neptune-v2/data/roster.json", "utf8")));
assert.equal(liveRoster.length, 680);
assert.equal(liveRoster.filter((station) => station.tier === "model_pool").length, 177);
assert.equal(liveRoster.filter((station) => station.tier === "limited_data").length, 503);
const rincon = liveRoster.find((station) => station.stationKey === "VCEHD|1100");
assert.equal(rincon?.name, "Rincon Beach");
assert.equal(rincon?.county, "Ventura");
assert.equal(rincon?.lat, 34.375);
assert.equal(rincon?.lon, -119.473);
assert.equal(rincon?.locationUnknown, false);
const bayshore = liveRoster.find((station) => station.stationKey === "CLBHHS|B-69");
assert.equal(bayshore?.name, "Bayshore at Division St");
assert.equal(bayshore?.tier, "limited_data");
assert.equal(bayshore?.county, "Long Beach City");
assert.equal(bayshore?.lat, 33.756);
assert.equal(bayshore?.lon, -118.131);
assert.equal(bayshore?.lastSampleDate, null);
for (const key of ["SCCWPCEL|Cowell", "SCCWPCEL|Main", "SCCWPCEL|O440", "SCCWPCEL|O520", "SCCWPCEL|O530"]) {
  assert.equal(liveRoster.find((station) => station.stationKey === key)?.tier, "limited_data", key);
}
const manifestFile = parseManifest(JSON.parse(readFileSync("data/neptune-v2/outputs/run_manifest.json", "utf8")));
assert.equal(manifestFile.generatedAt, "2026-10-15T17:48:12.000Z");
assert.equal(manifestFile.modelVersion, "ensemble");
assert.deepEqual(manifestFile.staleCounties, ["Humboldt", "Orange", "San Francisco"]);
assert.deepEqual(manifestFile.coordinateFlags, []);
assert.deepEqual(manifestFile.notForDisplay, ["alert_flag"]);
assert.equal(manifestFile.calibrationCeilings.byTier.limited_data, 26);
assert.equal(manifestFile.calibrationCeilings.byTier.model_pool, 100);
assert.deepEqual(manifestFile.calibrationCeilings.groups, {});
const four = parseIndexBands({
  by_tier: {
    model_pool: [
      { id: "a", min: 0, max: 24 },
      { id: "b", min: 25, max: 49 },
      { id: "c", min: 50, max: 74 },
      { id: "d", min: 75, max: 100 },
    ],
  },
});
assert.equal(four?.tiers.model_pool?.length, 4);
assert.equal(resolveNeptuneDisplay(80, null, four, { tier: "model_pool" })?.bandId, "d");
assert.equal(resolveNeptuneDisplay(80, null, four, { tier: "limited_data" })?.bandId, null);

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
assert.equal(resolveNeptuneDisplay(90, null, alt, { tier: "limited_data" })?.bandId, "good");
assert.equal(resolveNeptuneDisplay(90, null, alt, { tier: "model_pool" })?.bandId, "good");
assert.equal(resolveNeptuneDisplay(90, "poor", alt)?.bandId, "good");
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
assert.deepEqual(readNeptuneFields({ probability: 0.4 }), { index: null, band: null, overrideReason: null });
const lowered = resolveNeptuneDisplay(90, "good", alt, { daysSinceSample: 12 });
assert.equal(lowered?.lowered, true);
assert.match(indexConfidenceNote(lowered!, "en") ?? "", /last lab test 12 days ago/);
assert.match(indexConfidenceNote(lowered!, "es") ?? "", /hace 12 días/);
const both = resolveNeptuneDisplay(90, "good", alt, { daysSinceSample: 12, fallbackUsed: true });
assert.match(indexConfidenceNote(both!, "en") ?? "", /12 days ago/);
assert.match(indexConfidenceNote(both!, "en") ?? "", /fallback/);
assert.equal(resolveNeptuneDisplay(90, "good", alt, { daysSinceSample: 2 })?.lowered, false);
assert.equal(displayBandLabel(resolveNeptuneDisplay(90, "good", alt)!, "es"), "Bueno");
assert.equal(displayBandLabel(resolveNeptuneDisplay(60, "caution", alt)!, "es"), "Precaución");
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

assert.equal(locationUnknownFromRow({ location_status: "Unknown" }), true);
assert.equal(locationUnknownFromRow({ locationStatus: "unknown" }), true);
assert.equal(locationUnknownFromRow({ bad_location: true }), true);
assert.equal(locationUnknownFromRow({ location_unknown: "yes" }), true);
assert.equal(locationUnknownFromRow({ location_status: "ok" }), false);
assert.equal(locationUnknownFromRow({ bad_location: false }), false);
assert.equal(locationUnknownFromRow({ final_status: "Unknown", call: "Unknown", prediction: "Unknown", posting_status: "unknown" }), false);
assert.equal(locationUnknownFromRow({}), false);
const baja = parseRosterJson([{ station_code: "BC-010", name: "Baja", lat: 31.86, lon: -116.62 }])[0];
assert.equal(baja?.lat, 31.86);
assert.equal(baja?.lon, -116.62);
assert.equal(baja?.locationUnknown, false);
const flagged = parseRosterJson([{ station_code: "BC-020", name: "Flagged", lat: 32.4, lon: -117.1, location_status: "Unknown" }])[0];
assert.equal(flagged?.lat, 32.4);
assert.equal(flagged?.locationUnknown, true);
const word = parseRosterJson([{ station_code: "X", name: "Word", lat: "Unknown", lon: "Unknown" }])[0];
assert.equal(word?.lat, null);
assert.equal(word?.locationUnknown, true);

console.log("neptune contract checks passed");
