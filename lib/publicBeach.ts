import type { ForecastHorizon } from "./forecastDisplay.ts";
import type { RosterTier, Status } from "./data.ts";
import type { ConfidenceLevel, EstimateMethod } from "./publishedReading.ts";

/** One published day of the experimental outlook. Status words only — no probability. */
export interface OutlookDay {
  date: string;
  status: Status;
}

/**
 * What a public page is allowed to say about one beach.
 * Every field is copied from the published files. Null means the file
 * did not include it, which is not the same as zero.
 */
export interface PublicBeach {
  code: string;
  slug: string;
  name: string;
  county: string | null;
  latitude: number;
  longitude: number;
  hasEstimate: boolean;
  status: Status | null;
  neptuneIndex: number | null;
  neptuneBand: string | null;
  daysSinceSample: number | null;
  noRecentSample: boolean;
  staleAfterDays: number | null;
  tier: RosterTier | null;
  lastResultMpn: number | null;
  rainTodayMm: number | null;
  rainPrior3dMm: number | null;
  horizon: ForecastHorizon;
  outlook: OutlookDay[];
  fallbackUsed: boolean | null;
  method: EstimateMethod | null;
  confidence: ConfidenceLevel | null;
  postingStatus: string | null;
  postingSource: string | null;
  finalStatus: string | null;
  rainAdvisory: boolean | null;
}

/** The home screen list. Rain, lab results, and the outlook stay on the beach page. */
export type GlanceBeach = Pick<
  PublicBeach,
  | "code"
  | "slug"
  | "name"
  | "county"
  | "latitude"
  | "longitude"
  | "hasEstimate"
  | "status"
  | "neptuneIndex"
  | "neptuneBand"
  | "daysSinceSample"
  | "noRecentSample"
  | "staleAfterDays"
  | "tier"
  | "method"
  | "confidence"
  | "postingStatus"
  | "postingSource"
  | "finalStatus"
  | "rainAdvisory"
>;

export function toGlance(beach: PublicBeach): GlanceBeach {
  return {
    code: beach.code,
    slug: beach.slug,
    name: beach.name,
    county: beach.county,
    latitude: beach.latitude,
    longitude: beach.longitude,
    hasEstimate: beach.hasEstimate,
    status: beach.status,
    neptuneIndex: beach.neptuneIndex,
    neptuneBand: beach.neptuneBand,
    daysSinceSample: beach.daysSinceSample,
    noRecentSample: beach.noRecentSample,
    staleAfterDays: beach.staleAfterDays,
    tier: beach.tier,
    method: beach.method,
    confidence: beach.confidence,
    postingStatus: beach.postingStatus,
    postingSource: beach.postingSource,
    finalStatus: beach.finalStatus,
    rainAdvisory: beach.rainAdvisory,
  };
}
