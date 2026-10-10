import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignSlugs, encodeStationKey, resolveSlugMatch, slugifyName } from "../lib/beachSlug.ts";
import { dailySummary, publishedOutlook, type SummaryFacts } from "../lib/dailySummary.ts";
import { SHOW_STATEWIDE_STATUS_COUNTS, statewideStatusHeadline } from "../lib/statewideCounts.ts";
import { displayBandLabel, indexScalePhrase, parseIndexBands, resolveNeptuneDisplay } from "../lib/neptuneIndex.ts";
import { staleCountyBanner, statusDetail } from "../lib/publicCopy.ts";
import { statusReading } from "../lib/waterStatus.ts";
import { nearestBeachNeighbors } from "../lib/beachNeighbors.ts";
import { coordinatesOutsideWestCoast, hasMapCoordinates, nearest } from "../lib/geo.ts";

const base: SummaryFacts = {
  hasEstimate: true,
  status: "Normal",
  neptuneIndex: null,
  neptuneBand: null,
  neptuneDisplay: null,
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
assert.deepEqual(named, [{ date: "2026-10-10", status: "Not recommended", experimental: true }]);
const namedSummary = dailySummary({ ...base, outlook: named }, "en");
assert.match(namedSummary.outlook, /Saturday is an elevated risk/);
assert.doesNotMatch(namedSummary.outlook, /Over the limit/);
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
assert.match(posted.status, /Closed: Beach closed/);
assert.doesNotMatch(posted.status, /Closed: Closed|County closure/);
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

const noCall = dailySummary({ ...base, status: "Normal", callUnknown: true }, "en");
assert.equal(noCall.status, "Not enough recent data to call");
assert.doesNotMatch(noCall.status, /under the|Safe|Good/i);
const noCallEs = dailySummary({ ...base, status: "Normal", callUnknown: true }, "es");
assert.equal(noCallEs.status, "No hay datos recientes suficientes para decidir");
assert.doesNotMatch(noCallEs.status, /seguro/i);
const noCallFromStatus = dailySummary({ ...base, status: "Normal", finalStatus: "Unknown" }, "en");
assert.equal(noCallFromStatus.status, "Not enough recent data to call");
assert.doesNotMatch(noCallFromStatus.status, /under the/);
const noCallOutlook = dailySummary(
  { ...base, outlook: [{ date: "2026-10-10", status: "Normal", experimental: true, callUnknown: true }] },
  "en"
);
assert.match(noCallOutlook.outlook, /Not enough recent data to call/);
assert.doesNotMatch(noCallOutlook.outlook, /under the limit/);

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
assert.match(warning.status, /^Warning\. Source: Ventura County/);
assert.doesNotMatch(warning.status, /Warning: Warning|County warning/);
assert.match(warning.status, /Source: Ventura County/);
assert.match(warning.status, /Our estimate:/);
assert.match(warning.status, /under the/);
assert.doesNotMatch(warning.status, /\bsafe\b/i);
assert.equal(warning.postingNote, null);

assert.match(dailySummary({ ...base, lastResultMpn: 40 }, "en").recentResult ?? "", /40 MPN/);
assert.match(dailySummary({ ...base, lastResultMpn: 40 }, "en").recentResult ?? "", /Under the limit/);
assert.doesNotMatch(dailySummary({ ...base, lastResultMpn: 40 }, "en").recentResult ?? "", /Over the limit/);
assert.match(dailySummary({ ...base, lastResultMpn: 104 }, "en").recentResult ?? "", /At the limit/);
assert.doesNotMatch(dailySummary({ ...base, lastResultMpn: 104 }, "en").recentResult ?? "", /Over the limit/);
const labOver = dailySummary({ ...base, lastResultMpn: 180 }, "en").recentResult ?? "";
assert.match(labOver, /180 MPN/);
assert.match(labOver, /Over the limit/);
assert.doesNotMatch(labOver, /Elevated risk/);

const missingAge = dailySummary({ ...base, daysSinceSample: null }, "en");
assert.equal(missingAge.lastTested, null);

const old = dailySummary({ ...base, daysSinceSample: 65 }, "en");
assert.match(old.limitedLab ?? "", /Limited lab data/);

const noneEstimate = dailySummary({ ...base, hasEstimate: false, status: "Normal" }, "en");
assert.match(noneEstimate.status, /No estimate was published/);
assert.doesNotMatch(noneEstimate.status, /under the/);

const indexScale = parseIndexBands(JSON.parse(readFileSync("data/neptune-v2/config/neptune_index_bands.json", "utf8")));
const indexOnly = dailySummary(
  { ...base, neptuneDisplay: resolveNeptuneDisplay(null, "unhealthy_for_swimming", indexScale) },
  "en"
);
assert.match(indexOnly.status, /No number was published/);
assert.match(indexOnly.status, /Unhealthy for Swimming/);
assert.doesNotMatch(indexOnly.status, /\d/);

const indexed = dailySummary(
  { ...base, neptuneDisplay: resolveNeptuneDisplay(92, "good", indexScale) },
  "en"
);
assert.match(indexed.status, /92 \/ 100, higher is cleaner/);
assert.match(indexed.status, /Good/);
assert.doesNotMatch(indexed.status, /Hazardous/);
const indexedUnknown = dailySummary(
  { ...base, callUnknown: true, finalStatus: "Unknown", neptuneDisplay: resolveNeptuneDisplay(92, "good", indexScale) },
  "en"
);
assert.match(indexedUnknown.status, /92 \/ 100/);
assert.doesNotMatch(indexedUnknown.status, /under the limit|Not enough recent data|\bSafe\b/);
const postedUnknown = dailySummary(
  { ...base, postingStatus: "closure", postingSource: "Orange County", finalStatus: "Unknown" },
  "en"
);
assert.match(postedUnknown.status, /^Closed\. Source: Orange County/);
assert.match(postedUnknown.status, /Not enough recent data to call/);
assert.doesNotMatch(postedUnknown.status, /Closed: Closed|Closed: Unknown|County closure|under the/);
const kept = dailySummary(
  { ...base, neptuneDisplay: resolveNeptuneDisplay(42, "hazardous", indexScale) },
  "en"
);
assert.match(kept.status, /42/);
assert.match(kept.status, /Hazardous/);
assert.doesNotMatch(kept.status, /\bGood\b/);
const loweredIndex = dailySummary(
  { ...base, daysSinceSample: 12, neptuneDisplay: resolveNeptuneDisplay(92, "good", indexScale, { daysSinceSample: 12 }) },
  "en"
);
assert.match(loweredIndex.status, /Lower confidence: last lab test 12 days ago/);
const rulesIndex = dailySummary(
  {
    ...base,
    method: "rules",
    neptuneDisplay: resolveNeptuneDisplay(92, null, indexScale, { tier: "model_pool", method: "rules" }),
  },
  "en"
);
assert.match(rulesIndex.status, /92 \/ 100/);
assert.match(rulesIndex.status, /last lab test \+ rain rule/);
assert.equal(rulesIndex.method, null);
assert.doesNotMatch(rulesIndex.status, /\bGood\b|\bCaution\b|\bPoor\b/);
const tierCaution = dailySummary(
  { ...base, neptuneDisplay: resolveNeptuneDisplay(92, null, indexScale, { tier: "model_pool" }) },
  "en"
);
assert.match(tierCaution.status, /Caution/);
assert.doesNotMatch(tierCaution.status, /is Good/);
const tierPoor = dailySummary(
  { ...base, tier: "limited_data", neptuneDisplay: resolveNeptuneDisplay(92, null, indexScale, { tier: "limited_data" }) },
  "en"
);
assert.match(tierPoor.status, /Poor/);
assert.doesNotMatch(tierPoor.status, /Caution/);

assert.equal(dailySummary({ ...base, fallbackUsed: null }, "en").fallback, null);
assert.match(dailySummary({ ...base, fallbackUsed: true }, "en").fallback ?? "", /fallback/);

for (const status of ["Normal", "Slightly elevated", "Not recommended"] as const) {
  assert.equal(statusDetail(status, "en"), statusReading(status).detail);
  assert.equal(statusDetail(status, "es"), statusReading(status).es.detail);
}
const elevated = statusDetail("Not recommended", "en");
assert.match(elevated, /Higher chance of bacteria above the limit/);
assert.match(elevated, /about half of exceedances/);
assert.doesNotMatch(elevated, /Over the limit|\bClosed\b|\bWarning\b/);
assert.equal(statusReading("Not recommended").pill, "Elevated risk");
assert.equal(statusReading("Not recommended").phrase, "an elevated risk");
assert.equal(staleCountyBanner([], "en"), null);
assert.equal(
  staleCountyBanner(["Orange", "Ventura"], "en"),
  "The latest run marked these counties stale: Orange, Ventura."
);
assert.match(staleCountyBanner(["Orange"], "es") ?? "", /desactualizados: Orange/);
assert.doesNotMatch(statusDetail("Not recommended", "es"), /Sobre el límite/);

const spanishGood = resolveNeptuneDisplay(92, "good", indexScale);
assert.ok(spanishGood);
assert.equal(displayBandLabel(spanishGood, "es"), "Bueno");
assert.match(indexScalePhrase(spanishGood, "es") ?? "", /más alto es más limpio/);
assert.equal(displayBandLabel(resolveNeptuneDisplay(70, "caution", indexScale)!, "es"), "Precaución");
assert.equal(displayBandLabel(resolveNeptuneDisplay(40, "poor", indexScale)!, "es"), "Mala");

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
assert.match(spanish.outlook, /en riesgo elevado/);
assert.doesNotMatch(spanish.outlook, /Sobre el límite|Over the limit/);
assert.match(spanish.recentResult ?? "", /Bajo el límite/);
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
assert.equal(statewideStatusHeadline(coast, "en", true), "2 beaches at elevated risk today");
assert.equal(
  statewideStatusHeadline([{ status: "Normal", hasEstimate: true, neptuneBand: "poor" }], "en", true),
  "1 beach at elevated risk today"
);
assert.equal(
  statewideStatusHeadline(
    [{ status: "Normal", hasEstimate: true, neptuneBand: "unhealthy_for_swimming", neptuneDisplay: { countsAsPoor: false } }],
    "en",
    true
  ),
  "0 beaches at elevated risk today"
);
assert.equal(
  statewideStatusHeadline([{ status: "Not recommended", hasEstimate: true }], "en", true),
  "1 beach at elevated risk today"
);
assert.equal(
  statewideStatusHeadline([{ status: "Not recommended", hasEstimate: true, callUnknown: true }], "en", true),
  "0 beaches at elevated risk today"
);
assert.equal(
  statewideStatusHeadline([{ status: "Normal", hasEstimate: true, callUnknown: true, neptuneBand: "poor" }], "en", true),
  "1 beach at elevated risk today"
);
assert.equal(statewideStatusHeadline([], "es", true), "0 playas en riesgo elevado hoy");
assert.equal(
  statewideStatusHeadline([{ status: "Normal", hasEstimate: true, neptuneIndex: 40, neptuneBand: "good" }], "en", true),
  "0 beaches at elevated risk today"
);
const overSummary = dailySummary({ ...base, status: "Not recommended" }, "en");
const overText = Object.values(overSummary).filter((value) => typeof value === "string").join("\n");
assert.match(overText, /Higher chance of bacteria above the limit/);
assert.doesNotMatch(overText, /Over the limit/);
assert.doesNotMatch(overText, /\d+ beaches/i);
assert.doesNotMatch(overText, /unsafe today/i);

const goLiveDays = [
  { date: "2026-10-10", status: "Not recommended" as const, experimental: false },
  { date: "2026-10-11", status: "Normal" as const, experimental: false },
];
const goLiveSummary = dailySummary({ ...base, outlook: goLiveDays }, "en");
assert.equal(goLiveSummary.outlookLabel, "Outlook");
assert.match(goLiveSummary.outlook, /Saturday is an elevated risk/);
assert.doesNotMatch(goLiveSummary.outlook, /Over the limit/);
assert.doesNotMatch(goLiveSummary.outlook, /still being tested/);
const mixedSummary = dailySummary(
  {
    ...base,
    outlook: [
      { date: "2026-10-10", status: "Not recommended", experimental: false },
      { date: "2026-10-11", status: "Normal", experimental: true },
    ],
  },
  "en"
);
assert.equal(mixedSummary.outlookLabel, "Experimental");
assert.match(mixedSummary.outlook, /still being tested/);
assert.equal(
  dailySummary({ ...base, outlook: [{ date: "2026-10-10", status: "Normal" }] }, "en").outlookLabel,
  "Experimental"
);

const hermosa = { latitude: 33.87, longitude: -118.41 };
const baja = { latitude: 31.86, longitude: -116.62 };
const placeholder = { latitude: -88, longitude: -88 };
const blank = { latitude: Number.NaN, longitude: Number.NaN };
assert.equal(hasMapCoordinates(hermosa), true);
assert.equal(coordinatesOutsideWestCoast(hermosa), false);
assert.equal(hasMapCoordinates(baja), true);
assert.equal(coordinatesOutsideWestCoast(baja), false);
assert.equal(hasMapCoordinates({ latitude: 31.5, longitude: -125 }), true);
assert.equal(hasMapCoordinates({ latitude: 42.5, longitude: -114 }), true);
assert.equal(hasMapCoordinates({ latitude: 31.49, longitude: -117 }), false);
assert.equal(hasMapCoordinates(placeholder), false);
assert.equal(coordinatesOutsideWestCoast(placeholder), true);
assert.equal(hasMapCoordinates({ latitude: 0, longitude: 0 }), false);
assert.equal(coordinatesOutsideWestCoast({ latitude: 0, longitude: 0 }), true);
assert.equal(coordinatesOutsideWestCoast({ latitude: 34, longitude: 118 }), true);
assert.equal(coordinatesOutsideWestCoast(blank), false);
assert.equal(hasMapCoordinates(blank), false);
assert.equal(hasMapCoordinates({ ...baja, locationUnknown: true }), false);
assert.equal(hasMapCoordinates({ ...hermosa, callUnknown: true }), true);
assert.deepEqual(
  nearest(
    { latitude: 34, longitude: -118.5 },
    [
      { code: "placeholder", latitude: -88, longitude: -88 },
      { code: "baja", latitude: 31.86, longitude: -116.62 },
      { code: "flagged", latitude: 32.5, longitude: -117.1, locationUnknown: true },
      { code: "near", latitude: 33.9, longitude: -118.4 },
      { code: "blank", latitude: Number.NaN, longitude: Number.NaN },
      { code: "north", latitude: 36.6, longitude: -121.9 },
    ],
    5
  ).map((beach) => beach.code),
  ["near", "baja", "north"]
);
const neighbors = nearestBeachNeighbors(
  { code: "here", name: "Here", latitude: 34, longitude: -118.4 },
  [
    { code: "south-real", name: "South", latitude: 33.5, longitude: -118.2 },
    { code: "placeholder", name: "Placeholder", latitude: -88, longitude: -88 },
    { code: "north-real", name: "North", latitude: 34.4, longitude: -119.7 },
  ]
);
assert.equal(neighbors.south?.code, "south-real");
assert.equal(neighbors.north?.code, "north-real");
assert.deepEqual(
  nearestBeachNeighbors(
    { code: "placeholder", name: "Placeholder", latitude: -88, longitude: -88 },
    [{ code: "south-real", name: "South", latitude: 33.5, longitude: -118.2 }]
  ),
  { north: undefined, south: undefined }
);

console.log("public page checks passed");
