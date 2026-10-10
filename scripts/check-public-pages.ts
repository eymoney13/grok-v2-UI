import assert from "node:assert/strict";
import { NEPTUNE_INDEX } from "../config/neptune-index.ts";
import { assignSlugs } from "../lib/beachSlug.ts";
import { dailySummary, publishedOutlook, type SummaryFacts } from "../lib/dailySummary.ts";
import { bandLabel, statusDetail, BAND_GUIDANCE_ES } from "../lib/publicCopy.ts";
import { statusReading } from "../lib/waterStatus.ts";

const base: SummaryFacts = {
  hasEstimate: true,
  status: "Normal",
  neptuneIndex: null,
  neptuneBand: null,
  daysSinceSample: 4,
  noRecentSample: false,
  staleAfterDays: null,
  county: "Los Angeles",
  tier: "model_pool",
  horizon: "label",
  outlook: [],
  rainTodayMm: null,
  rainPrior3dMm: null,
  lastResultMpn: null,
  fallbackUsed: null,
  method: null,
  confidence: null,
  postingStatus: null,
  postingSource: null,
  finalStatus: null,
  rainAdvisory: null,
};

const dry = dailySummary(base, "en");
assert.equal(dry.rain, null);
assert.equal(dry.recentResult, null);
assert.doesNotMatch(Object.values(dry).join("\n"), /rain/i);
assert.match(dry.outlook, /No day-ahead outlook was published/);
assert.doesNotMatch(dry.outlook, /Monday|Saturday|under the limit/i);
assert.equal(dry.outlookLabel, "Experimental");
assert.match(dry.lastTested ?? "", /4 days ago/);
assert.equal(dry.limitedLab, null);

const locked = publishedOutlook(
  [{ date: "2026-10-10", status: "Normal", locked: true }],
  "2026-10-09",
  "label"
);
assert.deepEqual(locked, []);
const lockedSummary = dailySummary({ ...base, outlook: locked }, "en");
assert.doesNotMatch(lockedSummary.outlook, /Saturday is under the limit/);

const named = publishedOutlook(
  [
    { date: "2026-10-10", status: "Not recommended" },
    { date: "2026-10-11", status: "Normal", locked: true },
  ],
  "2026-10-09",
  "label"
);
assert.deepEqual(named, [{ date: "2026-10-10", status: "Not recommended" }]);
const namedSummary = dailySummary({ ...base, outlook: named }, "en");
assert.match(namedSummary.outlook, /Saturday is over the limit/);
assert.match(namedSummary.outlook, /still being tested/);
assert.doesNotMatch(namedSummary.outlook, /Sunday is under the limit/);

assert.equal(
  dailySummary({ ...base, horizon: "hidden", outlook: named }, "en").outlook,
  "A multi-day forecast isn’t shown for this beach."
);

const none = dailySummary({ ...base, rainTodayMm: 0, rainPrior3dMm: 0 }, "en");
assert.match(none.rain ?? "", /no rain/i);

const trace = dailySummary({ ...base, rainTodayMm: 0.7, rainPrior3dMm: null }, "en");
assert.match(trace.rain ?? "", /0\.7 mm/);
assert.match(trace.rain ?? "", /2\.54 mm/);
assert.doesNotMatch(trace.rain ?? "", /because/i);

const wet = dailySummary({ ...base, rainTodayMm: 3, rainPrior3dMm: 1 }, "en");
assert.match(wet.rain ?? "", /wet/);
assert.equal(wet.rainAdvisory, null);

const posted = dailySummary(
  {
    ...base,
    method: "rules",
    confidence: "low",
    postingStatus: "Closed",
    postingSource: "Orange County",
    finalStatus: "Beach closed",
    rainAdvisory: true,
  },
  "en"
);
assert.match(posted.status, /Official posting: Beach closed/);
assert.match(posted.status, /Source: Orange County/);
assert.match(posted.status, /Our estimate:/);
assert.match(posted.method ?? "", /last lab test \+ rain rule/);
assert.match(posted.confidence?.text ?? "", /less certain/);
assert.match(posted.rainAdvisory ?? "", /Rain advisory/);
assert.equal(posted.confidence?.level, "low");

const echoed = dailySummary({ ...base, finalStatus: "Under the limit", confidence: "high" }, "en");
assert.doesNotMatch(echoed.status, /Official posting/);
assert.equal(echoed.confidence?.level, "high");
assert.doesNotMatch(echoed.confidence?.text ?? "", /less certain/);
assert.equal(dailySummary({ ...base, method: "model", rainAdvisory: true }, "en").rainAdvisory, null);
assert.equal(dailySummary({ ...base, method: "rules", rainAdvisory: false }, "en").rainAdvisory, null);

assert.match(dailySummary({ ...base, lastResultMpn: 40 }, "en").recentResult ?? "", /40 MPN/);
assert.match(dailySummary({ ...base, lastResultMpn: 40 }, "en").recentResult ?? "", /under the 104/);
assert.match(dailySummary({ ...base, lastResultMpn: 180 }, "en").recentResult ?? "", /over the 104/);

const missingAge = dailySummary({ ...base, daysSinceSample: null }, "en");
assert.equal(missingAge.lastTested, null);

const old = dailySummary({ ...base, daysSinceSample: 65 }, "en");
assert.match(old.limitedLab ?? "", /Limited lab data/);

const noneEstimate = dailySummary({ ...base, hasEstimate: false, status: "Normal" }, "en");
assert.match(noneEstimate.status, /No estimate was published/);
assert.doesNotMatch(noneEstimate.status, /under the/);

const indexOnly = dailySummary(
  { ...base, neptuneIndex: null, neptuneBand: "unhealthy_for_swimming" },
  "en"
);
assert.match(indexOnly.status, /No number was published/);
assert.doesNotMatch(indexOnly.status, /\d/);

const indexed = dailySummary({ ...base, neptuneIndex: 42, neptuneBand: "hazardous" }, "en");
assert.match(indexed.status, /42/);
assert.match(indexed.status, /Good/);
assert.doesNotMatch(indexed.status, /Hazardous/);

assert.equal(dailySummary({ ...base, fallbackUsed: null }, "en").fallback, null);
assert.match(dailySummary({ ...base, fallbackUsed: true }, "en").fallback ?? "", /fallback/);

for (const status of ["Normal", "Slightly elevated", "Not recommended"] as const) {
  assert.equal(statusDetail(status, "en"), statusReading(status).detail);
}

for (const band of NEPTUNE_INDEX.bands) {
  assert.equal(bandLabel(band.id, "en"), band.label);
  assert.ok(BAND_GUIDANCE_ES[band.id].length > 20);
  assert.ok(bandLabel(band.id, "es").length > 0);
}

const slugs = assignSlugs([
  { code: "A", name: "Hermosa Beach" },
  { code: "B", name: "Hermosa Beach" },
  { code: "0", name: "Huntington State Beach" },
  { code: "X", name: "!!" },
  { code: "CSD_S8", name: "San Diego — Ocean Beach" },
]);
assert.equal(slugs.get("0"), "huntington-state-beach");
assert.notEqual(slugs.get("A"), slugs.get("B"));
assert.match(slugs.get("X") ?? "", /^beach-/);
assert.equal(new Set(slugs.values()).size, slugs.size);
for (const slug of slugs.values()) assert.match(slug, /^[a-z0-9-]+$/);

const spanish = dailySummary({ ...base, outlook: named, lastResultMpn: 40, rainTodayMm: 0, rainPrior3dMm: 0 }, "es");
assert.match(spanish.outlook, /sábado/i);
assert.match(spanish.status, /104/);
assert.match(spanish.rain ?? "", /no muestra lluvia/);
assert.equal(spanish.outlookLabel, "Experimental");

console.log("public page checks passed");
