import type { BeachListItem } from "./data.ts";
import { scaleGroups, type IndexBand, type IndexScale } from "./neptuneIndex.ts";

export const LONG_BEACH_ID = "long-beach";
export const LONG_BEACH_LABEL = "Long Beach";
export const LONG_BEACH_NOTE = "City of Long Beach health agency, not Los Angeles County.";

export function coastGroupId(beach: { county: string | null; stationKey: string | null }): string {
  const county = (beach.county ?? "").trim().toLowerCase().replace(/\s+county$/, "");
  const key = (beach.stationKey ?? "").trim().toLowerCase();
  if (county === "long beach city" || county === "long beach" || key.startsWith("clbhhs|")) return LONG_BEACH_ID;
  return county || "unknown";
}

export function coastGroupLabel(id: string, sampleCounty: string | null): string {
  if (id === LONG_BEACH_ID) return LONG_BEACH_LABEL;
  const name = (sampleCounty ?? "").replace(/\s+county$/i, "").trim();
  return name || "Unknown county";
}

export function neverTestedBeach(beach: {
  hasEstimate: boolean;
  callUnknown?: boolean;
  lastSampleDate: string | null;
  neptuneDisplay?: unknown;
}): boolean {
  if (beach.hasEstimate || beach.callUnknown || beach.neptuneDisplay) return false;
  return beach.lastSampleDate == null;
}

export type AnswerGroup = "safe" | "caution" | "unsafe" | "untested" | "unknown" | "other";

export function answerGroup(beach: BeachListItem): AnswerGroup {
  if (neverTestedBeach(beach)) return "untested";
  if (beach.postingStatus === "warning" || beach.postingStatus === "closure") return "unsafe";
  if (beach.neptuneDisplay?.labOverride) return "unsafe";
  const id = beach.neptuneDisplay?.bandId;
  if (id === "good") return "safe";
  if (id === "moderate") return "caution";
  if (id === "likely_unsafe" || id === "very_likely_unsafe") return "unsafe";
  if (beach.callUnknown) return "unknown";
  return "other";
}

export function isOfficialPosting(beach: BeachListItem): boolean {
  return beach.postingStatus === "warning" || beach.postingStatus === "closure" || beach.postingStatus === "advisory";
}

export function bandsInUse(scale: IndexScale | null): IndexBand[] {
  return scaleGroups(scale).flatMap((group) => group.bands);
}

export function matchesCoast(beach: BeachListItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const hay = [beach.name, beach.proseName, beach.county, beach.code, beach.stationKey]
    .filter((part): part is string => !!part)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export interface CountyCard {
  id: string;
  label: string;
  count: number;
  safe: number;
  caution: number;
  unsafe: number;
  stale: boolean;
  note: string | null;
}

function samePlace(a: string | null, b: string): boolean {
  const norm = (value: string) => value.trim().toLowerCase().replace(/\s+county$/, "");
  return norm(a ?? "") !== "" && norm(a ?? "") === norm(b);
}

export function countyCards(beaches: readonly BeachListItem[], staleCounties: readonly string[]): CountyCard[] {
  const groups = new Map<string, BeachListItem[]>();
  for (const beach of beaches) {
    const id = coastGroupId(beach);
    const list = groups.get(id) ?? [];
    list.push(beach);
    groups.set(id, list);
  }
  const cards = [...groups.entries()].map(([id, list]) => {
    const sample = list[0];
    let safe = 0;
    let caution = 0;
    let unsafe = 0;
    for (const beach of list) {
      const group = answerGroup(beach);
      if (group === "safe") safe += 1;
      else if (group === "caution") caution += 1;
      else if (group === "unsafe") unsafe += 1;
    }
    const stale = staleCounties.some((name) => samePlace(sample?.county ?? null, name));
    return {
      id,
      label: coastGroupLabel(id, sample?.county ?? null),
      count: list.length,
      safe,
      caution,
      unsafe,
      stale,
      note: id === LONG_BEACH_ID ? LONG_BEACH_NOTE : null,
    };
  });
  cards.sort((a, b) => {
    if (a.id === LONG_BEACH_ID) return -1;
    if (b.id === LONG_BEACH_ID) return 1;
    return a.label.localeCompare(b.label);
  });
  return cards;
}
