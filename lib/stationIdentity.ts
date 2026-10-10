import type { DailyJoinedRow, LeadStatusRow } from "./neptuneContract.ts";

export interface StationMatch {
  code: string;
  name: string;
  county: string | null;
  agency: string | null;
  stationKey?: string | null;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * The daily row for this beach. The same station code can belong to more than
 * one agency. Last row wins only inside one identity. A repeated code that
 * the file does not distinguish is not applied to every beach that shares it.
 */
export function matchDailyRow(
  rows: DailyJoinedRow[],
  station: StationMatch,
  agencyColumn: boolean,
  stationsSharingCode: number
): DailyJoinedRow | null {
  if (station.stationKey?.trim()) {
    const want = norm(station.stationKey);
    const hits = rows.filter((row) => norm(row.stationKey) === want);
    if (hits.length > 0) return hits.at(-1) ?? null;
    if (rows.some((row) => row.stationKey)) return null;
  }
  const same = rows.filter((row) => row.code === station.code);
  if (same.length === 0) return null;
  if (agencyColumn) {
    const want = norm(station.agency);
    const hits = same.filter((row) => norm(row.agency) === want);
    return hits.at(-1) ?? null;
  }
  if (same.some((row) => row.name || row.county)) {
    const hits = same.filter((row) => {
      if (row.name && norm(row.name) !== norm(station.name)) return false;
      if (row.county && norm(row.county) !== norm(station.county)) return false;
      return true;
    });
    return hits.at(-1) ?? null;
  }
  if (stationsSharingCode > 1) return null;
  return same.at(-1) ?? null;
}

/** The lead rows for this beach. Last row wins inside one lead. */
export function matchLeadRows(
  rows: LeadStatusRow[],
  station: StationMatch,
  agencyColumn: boolean,
  stationsSharingCode: number
): LeadStatusRow[] {
  const found: LeadStatusRow[] = [];
  for (const lead of [0, 1, 2, 3]) {
    const subset = rows.filter((row) => row.lead === lead);
    const hit = matchDailyRow(subset, station, agencyColumn, stationsSharingCode);
    if (hit) found.push(hit as LeadStatusRow);
  }
  return found;
}
