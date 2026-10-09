import assert from "node:assert/strict";
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

console.log("neptune contract checks passed");
