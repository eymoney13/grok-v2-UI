import assert from "node:assert/strict";
import { NEPTUNE_INDEX } from "../config/neptune-index.ts";
import { assignSlugs, encodeStationKey, resolveSlugMatch, slugifyName } from "../lib/beachSlug.ts";
import { dailySummary, publishedOutlook, type SummaryFacts } from "../lib/dailySummary.ts";
import { SHOW_STATEWIDE_STATUS_COUNTS, statewideStatusHeadline } from "../lib/statewideCounts.ts";
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
  postingDate: null,
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
    postingStatus: "closure",
    postingSource: "Orange County",
    finalStatus: "Beach closed",
    rainAdvisory: true,
  },
  "en"
);
assert.match(posted.status, /County closure: Beach closed/);
assert.match(posted.status, /Source: Orange County/);
assert.match(posted.status, /Our estimate:/);
assert.equal(posted.postingNote, null);
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

const unknownPosting = dailySummary({ ...base, postingStatus: "unknown", finalStatus: "Safe" }, "en");
assert.doesNotMatch(unknownPosting.status, /County closure|Official posting|Safe/);
assert.match(unknownPosting.postingNote ?? "", /No official posting data for this beach/);
assert.doesNotMatch(unknownPosting.postingNote ?? "", /safe/i);
assert.equal(unknownPosting.postingNote?.includes("Safe"), false);

const opened = dailySummary(
  {
    ...base,
    postingStatus: "open",
    postingSource: "Ventura County",
    postingDate: "2026-10-09",
    finalStatus: "Safe",
  },
  "en"
);
assert.match(opened.status, /under the/);
assert.doesNotMatch(opened.status, /County closure|Official posting|\bSafe\b/);
assert.match(opened.postingNote ?? "", /No active county postings today/);
assert.match(opened.postingNote ?? "", /Ventura County/);
assert.match(opened.postingNote ?? "", /October 9, 2026/);
assert.doesNotMatch(opened.postingNote ?? "", /safe/i);

const warning = dailySummary({ ...base, postingStatus: "warning", postingSource: "Ventura County" }, "en");
assert.match(warning.status, /County warning: Warning/);
assert.match(warning.status, /Source: Ventura County/);
assert.match(warning.status, /Our estimate:/);
assert.match(warning.status, /under the/);
assert.doesNotMatch(warning.status, /\bsafe\b/i);
assert.equal(warning.postingNote, null);

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

const slugBeaches = [
  { code: "A", name: "Hermosa Beach", county: "Los Angeles" },
  { code: "B", name: "Hermosa Beach", county: "Los Angeles" },
  { code: "0", name: "Huntington State Beach", county: "Orange" },
  { code: "0", name: "Another Beach", county: "San Diego" },
  { code: "X", name: "!!", county: null },
  { code: "CSD_S8", name: "San Diego — Ocean Beach", county: "San Diego" },
];
const slugs = assignSlugs(slugBeaches);
assert.equal(slugs[2], "huntington-state-beach-orange-0");
assert.equal(slugs[3], "another-beach-san-diego-0");
assert.notEqual(slugs[0], slugs[1]);
assert.match(slugs[0] ?? "", /hermosa-beach-los-angeles-a$/);
assert.match(slugs[4] ?? "", /^beach-/);
assert.equal(new Set(slugs).size, slugs.length);
for (const slug of slugs) {
  assert.match(slug, /^[a-z0-9-]+$/);
  assert.notEqual(slug, "0");
}
const withAgency = assignSlugs(
  [
    { code: "0", name: "North", county: "Orange", agency: "County Health" },
    { code: "0", name: "South", county: "Orange", agency: "Heal the Bay" },
  ],
  true
);
assert.deepEqual(withAgency, ["0-county-health", "0-heal-the-bay"]);
const withKey = assignSlugs(
  [
    { code: "0", name: "North", county: "Orange", agency: "County Health", stationKey: "oc-health-0" },
    { code: "0", name: "South", county: "Orange", agency: "Heal the Bay", stationKey: "HB/0" },
    { code: "0", name: "Blank Key Beach", county: "Ventura", agency: "Ventura County", stationKey: " " },
  ],
  true
);
assert.deepEqual(withKey, ["north--oc-health-0", "south--hb-0", "0-ventura-county"]);
const keyedCatalog = [
  { slug: "north--oc-health-0", code: "0", name: "North", stationKey: "oc-health-0" },
  { slug: "south--hb-0", code: "0", name: "South", stationKey: "HB/0" },
];
assert.equal(resolveSlugMatch(keyedCatalog, "HB/0")?.slug, "south--hb-0");
assert.equal(resolveSlugMatch(keyedCatalog, "old--hb-0")?.slug, "south--hb-0");
assert.equal(resolveSlugMatch(keyedCatalog, "0"), null);
const pipeBeaches = [
  { code: "0", name: "Huntington State Beach", county: "Orange", stationKey: "Orange County|0" },
  { code: "0", name: "Silver Strand State Beach", county: "San Diego", stationKey: "San Diego County|0" },
  { code: "0", name: "Twin", county: "Orange", stationKey: "Foo Bar|0" },
  { code: "0", name: "Twin", county: "Orange", stationKey: "Foo-Bar|0" },
];
const pipeSlugs = assignSlugs(pipeBeaches);
assert.equal(encodeStationKey("Orange County|0"), "orange-county~0");
assert.equal(pipeSlugs[0], "huntington-state-beach--orange-county~0");
assert.equal(pipeSlugs[1], "silver-strand-state-beach--san-diego-county~0");
assert.equal(pipeSlugs[2], "twin--foo-bar~0");
assert.equal(pipeSlugs[3], "twin--foo-bar~0-2");
for (const slug of pipeSlugs) assert.equal(slug.includes("|"), false);
const pipeCatalog = pipeBeaches.map((beach, index) => ({ ...beach, slug: pipeSlugs[index]! }));
assert.equal(resolveSlugMatch(pipeCatalog, "Orange County|0")?.slug, "huntington-state-beach--orange-county~0");
assert.equal(resolveSlugMatch(pipeCatalog, "orange-county~0")?.stationKey, "Orange County|0");
assert.equal(resolveSlugMatch(pipeCatalog, "old-name--orange-county~0")?.stationKey, "Orange County|0");
assert.equal(resolveSlugMatch(pipeCatalog, "twin--foo-bar~0-2")?.stationKey, "Foo-Bar|0");
assert.equal(resolveSlugMatch(pipeCatalog, "0"), null);
const catalog = slugBeaches.map((beach, index) => ({ ...beach, slug: slugs[index]! }));
assert.equal(resolveSlugMatch(catalog, "huntington-state-beach")?.slug, "huntington-state-beach-orange-0");
assert.equal(resolveSlugMatch(catalog, "0"), null);
assert.equal(resolveSlugMatch(catalog, "CSD_S8")?.code, "CSD_S8");
assert.equal(resolveSlugMatch(catalog, slugifyName("San Diego — Ocean Beach"))?.code, "CSD_S8");

const spanish = dailySummary({ ...base, outlook: named, lastResultMpn: 40, rainTodayMm: 0, rainPrior3dMm: 0 }, "es");
assert.match(spanish.outlook, /sábado/i);
assert.match(spanish.status, /104/);
assert.match(spanish.rain ?? "", /no muestra lluvia/);
assert.equal(spanish.outlookLabel, "Experimental");

assert.equal(SHOW_STATEWIDE_STATUS_COUNTS, false);
const coast = [
  { status: "Not recommended" as const, hasEstimate: true },
  { status: "Not recommended" as const, hasEstimate: true },
  { status: "Normal" as const, hasEstimate: true },
  { status: "Slightly elevated" as const, hasEstimate: true },
  { status: "Not recommended" as const, hasEstimate: false },
  { status: null, hasEstimate: false, neptuneIndex: 400, neptuneBand: "hazardous" },
  { status: "Normal" as const, hasEstimate: true, neptuneIndex: 160, neptuneBand: "unhealthy_for_swimming" },
];
assert.equal(statewideStatusHeadline(coast), null);
assert.equal(statewideStatusHeadline(coast, "es"), null);
assert.equal(statewideStatusHeadline(coast, "en", true), "3 beaches over the limit today");
assert.equal(
  statewideStatusHeadline([{ status: "Not recommended", hasEstimate: true }], "en", true),
  "1 beach over the limit today"
);
assert.equal(statewideStatusHeadline([], "es", true), "0 playas sobre el límite hoy");
assert.equal(
  statewideStatusHeadline([{ status: "Normal", hasEstimate: true, neptuneIndex: 40, neptuneBand: "good" }], "en", true),
  "0 beaches over the limit today"
);
const overSummary = dailySummary({ ...base, status: "Not recommended" }, "en");
const overText = Object.values(overSummary).filter((value) => typeof value === "string").join("\n");
assert.match(overText, /over the/);
assert.doesNotMatch(overText, /\d+ beaches/i);
assert.doesNotMatch(overText, /unsafe today/i);

console.log("public page checks passed");
