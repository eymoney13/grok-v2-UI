import { CALIFORNIA_BOX, isInCaliforniaBox, outsideCaliforniaLine } from "./californiaBox.mjs";

export { CALIFORNIA_BOX };

export interface LatLon {
  latitude: number;
  longitude: number;
}

export function hasCoordinates(place: LatLon): boolean {
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
}

/** Finite coordinates inside the rough California box. Safe to draw and to sort by distance. */
export function hasMapCoordinates(place: LatLon): boolean {
  return isInCaliforniaBox(place.latitude, place.longitude);
}

/** Finite coordinates outside the box. Blank or non-numeric positions are not placeholders. */
export function coordinatesOutsideCalifornia(place: LatLon): boolean {
  return hasCoordinates(place) && !hasMapCoordinates(place);
}

const loggedOutsideCalifornia = new Set<string>();

/** Name each finite out-of-box station once per process, for the dev server and `next build`. */
export function logStationsOutsideCalifornia(
  stations: Array<{ name: string; code: string; latitude: number; longitude: number }>
): void {
  for (const station of stations) {
    if (!coordinatesOutsideCalifornia(station)) continue;
    const key = `${station.name}\0${station.code}\0${station.latitude}\0${station.longitude}`;
    if (loggedOutsideCalifornia.has(key)) continue;
    loggedOutsideCalifornia.add(key);
    console.log(outsideCaliforniaLine(station));
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
