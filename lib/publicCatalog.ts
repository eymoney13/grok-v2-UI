import "server-only";
import { unstable_cache } from "next/cache";
import { resolveSlugMatch } from "./beachSlug.ts";
import { getLocation, type BeachData, type BeachListItem } from "./data.ts";
import { publishedOutlook } from "./dailySummary.ts";
import { forecastHorizonFor } from "./forecastDisplay.ts";
import { loadDashboardData } from "./loadData.ts";
import type { PublicBeach } from "./publicBeach.ts";
import { copyReading } from "./publishedReading.ts";
import { calendarDay } from "./waterStatus.ts";

export interface PublicCatalog {
  beaches: PublicBeach[];
  predictionDate: string;
  generatedAt: string | null;
  readingsCurrent: boolean;
}

const loadCachedBeaches = unstable_cache(
  async (): Promise<Omit<PublicCatalog, "readingsCurrent">> => {
    const config = getLocation("california");
    if (!config) return { beaches: [], predictionDate: "", generatedAt: null };
    const data = await loadDashboardData(config);
    const beaches = [
      ...data.beaches.map((beach) => fromModeled(beach, beach.id)),
      ...data.unmodeled.map((beach) => fromUnmodeled(beach, beach.id)),
    ];
    return {
      beaches,
      predictionDate: data.predictionDate,
      generatedAt: data.generatedAt,
    };
  },
  ["california-public-beaches"],
  { revalidate: 3600 }
);

export async function loadPublicCatalog(): Promise<PublicCatalog> {
  const cached = await loadCachedBeaches();
  return {
    ...cached,
    readingsCurrent: !cached.predictionDate || cached.predictionDate >= calendarDay("America/Los_Angeles"),
  };
}

export async function resolvePublicBeach(slugOrCode: string): Promise<PublicBeach | null> {
  const decoded = decodeURIComponent(slugOrCode);
  const { beaches } = await loadPublicCatalog();
  return resolveSlugMatch(beaches, decoded);
}

function fromModeled(beach: BeachData, slug: string): PublicBeach {
  const horizon = forecastHorizonFor(beach.code);
  return {
    code: beach.code,
    slug,
    name: beach.name,
    stationKey: beach.stationKey,
    county: beach.county,
    latitude: beach.latitude,
    longitude: beach.longitude,
    hasEstimate: true,
    status: beach.status,
    neptuneIndex: beach.neptuneIndex,
    neptuneBand: beach.neptuneBand,
    daysSinceSample: beach.daysSinceSample,
    noRecentSample: beach.noRecentSample,
    staleAfterDays: beach.staleAfterDays,
    tier: beach.tier,
    lastResultMpn:
      typeof beach.lastResult === "number" && Number.isFinite(beach.lastResult) ? beach.lastResult : null,
    rainTodayMm: beach.conditions?.rainTodayMm ?? null,
    rainPrior3dMm: beach.conditions?.rainPrior3dMm ?? null,
    horizon,
    outlook: publishedOutlook(beach.forecast, beach.predictionDate, horizon),
    fallbackUsed: beach.fallbackUsed,
    ...copyReading(beach),
  };
}

function fromUnmodeled(beach: BeachListItem, slug: string): PublicBeach {
  return {
    code: beach.code,
    slug,
    name: beach.name,
    stationKey: beach.stationKey,
    county: beach.county,
    latitude: beach.latitude,
    longitude: beach.longitude,
    hasEstimate: false,
    status: null,
    neptuneIndex: beach.neptuneIndex,
    neptuneBand: beach.neptuneBand,
    daysSinceSample: beach.daysSinceSample,
    noRecentSample: beach.noRecentSample,
    staleAfterDays: beach.staleAfterDays,
    tier: beach.tier,
    lastResultMpn: null,
    rainTodayMm: null,
    rainPrior3dMm: null,
    horizon: forecastHorizonFor(beach.code),
    outlook: [],
    fallbackUsed: beach.fallbackUsed,
    ...copyReading(beach),
  };
}
