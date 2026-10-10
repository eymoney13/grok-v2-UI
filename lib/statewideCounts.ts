import { NEPTUNE_INDEX } from "../config/neptune-index.ts";
import type { Status } from "./data.ts";
import { publishedNeptuneScore } from "./neptuneIndex.ts";
import type { Lang } from "./publicCopy.ts";

/**
 * Coast-wide status totals, such as "12 beaches over the limit today".
 *
 * The current model is uncalibrated and runs high. A single beach can show
 * its own reading. A total of those readings would sound like a fact about
 * the coast, and it is not. Leave this off. Roster size, a filter's match
 * count, and a county's beach count are inventory, not this total.
 *
 * Official county postings stay on each beach. They are not added in here.
 */
export const SHOW_STATEWIDE_STATUS_COUNTS = false;

export interface StatusCountable {
  status?: Status | null;
  hasEstimate?: boolean;
  neptuneIndex?: number | null;
  neptuneBand?: string | null;
}

function limitLevel(): number {
  return NEPTUNE_INDEX.bands.find((band) => band.id === NEPTUNE_INDEX.limitBandId)?.level ?? 3;
}

/** One beach on the over-limit side of a published estimate. Not a posting. */
export function beachCountsAsOverLimit(beach: StatusCountable): boolean {
  if (beach.hasEstimate === false) return false;
  if (beach.status === "Not recommended") return true;
  const score = publishedNeptuneScore(beach.neptuneIndex, beach.neptuneBand);
  return score != null && score.band.level >= limitLevel();
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
  if (lang === "es") {
    return count === 1 ? "1 playa sobre el límite hoy" : `${count} playas sobre el límite hoy`;
  }
  return count === 1 ? "1 beach over the limit today" : `${count} beaches over the limit today`;
}
