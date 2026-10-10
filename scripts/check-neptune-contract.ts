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
  textFlag,
} from "../lib/neptuneContract.ts";
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
assert.equal(textFlag(0.8), null);

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
