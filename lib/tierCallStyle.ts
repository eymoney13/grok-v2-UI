/**
 * How an Elevated risk call is drawn for each roster tier.
 *
 * Flip a value in `TIER_ELEVATED_STYLE` to reverse the look. "cautious" uses
 * the same grey, italic, dashed treatment as a low-confidence reading, and
 * adds the note below. "full" keeps the strong Elevated risk color.
 * A beach with no published tier stays "full".
 *
 * The confidence column does not choose this. A high confidence on a
 * cautious tier still uses the grey style and the note. A low confidence
 * on a full tier does not soften the call.
 */

import type { RosterTier } from "./neptuneContract.ts";
import type { ModelCall, ReaderLang } from "./readerLabels.ts";

export type ElevatedCallStyle = "full" | "cautious";

export const TIER_ELEVATED_STYLE: Record<RosterTier, ElevatedCallStyle> = {
  limited_data: "cautious",
  model_pool: "full",
};

export const CAUTIOUS_ELEVATED_NOTE: Record<ReaderLang, string> = {
  en: "Limited testing history, so this is a cautious estimate.",
  es: "Historial de pruebas limitado, así que este es un estimado cauteloso.",
};

export function elevatedCallStyle(
  tier: RosterTier | null | undefined,
  styles: Record<RosterTier, ElevatedCallStyle> = TIER_ELEVATED_STYLE
): ElevatedCallStyle {
  if (tier !== "limited_data" && tier !== "model_pool") return "full";
  return styles[tier] ?? "full";
}

/** The cautious note, only for an Elevated risk call on a cautious tier. */
export function cautiousElevatedNote(
  tier: RosterTier | null | undefined,
  status: ModelCall | null | undefined,
  lang: ReaderLang,
  styles: Record<RosterTier, ElevatedCallStyle> = TIER_ELEVATED_STYLE
): string | null {
  if (status !== "Not recommended") return null;
  if (elevatedCallStyle(tier, styles) !== "cautious") return null;
  return CAUTIOUS_ELEVATED_NOTE[lang];
}
