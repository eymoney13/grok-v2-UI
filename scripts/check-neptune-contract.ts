import assert from "node:assert/strict";
import { NEPTUNE_INDEX } from "../config/neptune-index.ts";
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
  parseDailyStatus,
  parseDailyStatusRows,
  textFlag,
} from "../lib/neptuneContract.ts";
import {
  confidenceWords,
  mergeReadings,
  methodWords,
  officialPosting,
  openPostingWords,
  parseMethod,
  parsePostingStatus,
  parsePublishedReading,
  postingLabel,
  rainAdvisoryWords,
  unknownPostingWords,
} from "../lib/publishedReading.ts";
import {
  bandForValue,
  parseNeptuneBandId,
  publishedNeptuneScore,
  readNeptuneFields,
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
assert.equal(parseDailyStatusRows([]).readings.size, 0);
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
const fromNumber = publishedNeptuneScore(indexed.neptuneIndex, indexed.neptuneBand);
assert.equal(fromNumber?.index, 126);
assert.equal(fromNumber?.band.id, "caution");
assert.equal(bandForValue(100)?.id, "moderate");
assert.equal(bandForValue(101)?.id, "caution");
assert.equal(parseNeptuneBandId("Unhealthy for swimming"), "unhealthy_for_swimming");
const bandOnly = publishedNeptuneScore(null, parseNeptuneBandId("Unhealthy for swimming"));
assert.equal(bandOnly?.index, null);
assert.equal(bandOnly?.band.id, "unhealthy_for_swimming");
assert.equal(publishedNeptuneScore(900, "good")?.index, null);
assert.equal(publishedNeptuneScore(900, "good")?.band.id, "good");
assert.equal(publishedNeptuneScore(900, "not-a-band"), null);
assert.equal(publishedNeptuneScore(null, null), null);
assert.deepEqual(readNeptuneFields({ probability: 0.4 }), { index: null, band: null });
assert.equal(NEPTUNE_INDEX.limitBandId, "caution");
assert.equal(NEPTUNE_INDEX.bands.find((band) => band.id === "caution")?.min, 101);

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
for (const band of NEPTUNE_INDEX.bands) {
  assert.ok(contrast(band.color, band.textColor) >= 4.5, `${band.id} badge contrast`);
  assert.ok(contrast(band.surface, band.surfaceText) >= 4.5, `${band.id} card contrast`);
}

console.log("neptune contract checks passed");
