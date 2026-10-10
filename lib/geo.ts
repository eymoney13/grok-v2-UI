import { isInWestCoastBox, outsideWestCoastLine, WEST_COAST_BOX } from "./westCoastBox.mjs";

export { WEST_COAST_BOX };

export interface LatLon {
  latitude: number;
  longitude: number;
  /** Published location flag. Unknown means these numbers are not a map position. */
  locationUnknown?: boolean | null;
}

export function hasCoordinates(place: LatLon): boolean {
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
}

/** Finite coordinates inside the loose West Coast box, and not marked unknown. */
export function hasMapCoordinates(place: LatLon): boolean {
  return place.locationUnknown !== true && isInWestCoastBox(place.latitude, place.longitude);
}

/** Finite coordinates outside the box. Blank positions and an unknown-location flag are separate. */
export function coordinatesOutsideWestCoast(place: LatLon): boolean {
  return hasCoordinates(place) && !isInWestCoastBox(place.latitude, place.longitude);
}

const loggedOutsideWestCoast = new Set<string>();

/** Name each unmapped station once per process, for the dev server and `next build`. */
export function logStationsOutsideWestCoast(
  stations: Array<{ name: string; code: string; latitude: number; longitude: number; locationUnknown?: boolean | null }>
): void {
  for (const station of stations) {
    const outside = coordinatesOutsideWestCoast(station);
    const flagged = station.locationUnknown === true;
    if (!outside && !flagged) continue;
    const key = `${station.name}\0${station.code}\0${station.latitude}\0${station.longitude}\0${flagged}`;
    if (loggedOutsideWestCoast.has(key)) continue;
    loggedOutsideWestCoast.add(key);
    console.log(outsideWestCoastLine({ ...station, locationUnknown: flagged }));
  }
}

/** Great-circle distance in miles. */
export function milesBetween(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const lat1 = a.latitude * rad;
  const lat2 = b.latitude * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearest<T extends LatLon & { code: string; slug?: string; id?: string }>(
  origin: LatLon,
  beaches: T[],
  limit: number,
  excludeCode?: string,
  excludeId?: string
): T[] {
  return beaches
    .filter((beach) => {
      if (!hasMapCoordinates(beach)) return false;
      const identity = beach.slug ?? beach.id;
      if (excludeId) return identity !== excludeId;
      return beach.code !== excludeCode;
    })
    .map((beach) => ({ beach, miles: milesBetween(origin, beach) }))
    .sort((a, b) => a.miles - b.miles || (a.beach.slug ?? a.beach.id ?? a.beach.code).localeCompare(b.beach.slug ?? b.beach.id ?? b.beach.code))
    .slice(0, limit)
    .map((item) => item.beach);
}
