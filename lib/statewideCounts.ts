import type { Status } from "./data.ts";
import type { Lang } from "./publicCopy.ts";
import { elevatedRiskCount } from "./readerLabels.ts";

/**
 * Coast-wide status totals, such as "12 beaches at elevated risk today".
 *
 * The current model is uncalibrated and runs high. A single beach can show
 * its own reading. A total of those readings would sound like a fact about
 * the coast, and it is not. Leave this off. Roster size, a filter's match
 * count, and a county's beach count are inventory, not this total.
 *
 * Official county postings stay on each beach. They are not added in here.
 * A warning that forces the index band to Poor does not count unless the
 * published band itself is poor, or the estimate is Not recommended.
 */
export const SHOW_STATEWIDE_STATUS_COUNTS = false;

export interface StatusCountable {
  status?: Status | null;
  hasEstimate?: boolean;
  neptuneBand?: string | null;
  neptuneDisplay?: { countsAsPoor?: boolean } | null;
  /** A rules-path Unknown is not an elevated-risk call. A published poor index still counts. */
  callUnknown?: boolean;
}

/** One beach on the elevated-risk side of a published estimate. Not a posting or a lab result. */
export function beachCountsAsOverLimit(beach: StatusCountable): boolean {
  if (beach.hasEstimate === false) return false;
  if (beach.callUnknown) {
    if (beach.neptuneDisplay?.countsAsPoor) return true;
    return beach.neptuneBand === "poor";
  }
  if (beach.status === "Not recommended") return true;
  if (beach.neptuneDisplay?.countsAsPoor) return true;
  return beach.neptuneBand === "poor";
}

/**
 * The statewide sentence, or null while the flag is off.
 * `enabled` exists so a test can read the wording without turning the flag on.
 */
export function statewideStatusHeadline(
  beaches: readonly StatusCountable[],
  lang: Lang = "en",
  enabled: boolean = SHOW_STATEWIDE_STATUS_COUNTS,
): string | null {
  if (!enabled) return null;
  const count = beaches.filter(beachCountsAsOverLimit).length;
  return elevatedRiskCount(count, lang);
}
