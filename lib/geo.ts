export interface LatLon {
  latitude: number;
  longitude: number;
}

export function hasCoordinates(place: LatLon): boolean {
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
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
      if (!hasCoordinates(beach)) return false;
      const identity = beach.slug ?? beach.id;
      if (excludeId) return identity !== excludeId;
      return beach.code !== excludeCode;
    })
    .map((beach) => ({ beach, miles: milesBetween(origin, beach) }))
    .sort((a, b) => a.miles - b.miles || (a.beach.slug ?? a.beach.id ?? a.beach.code).localeCompare(b.beach.slug ?? b.beach.id ?? b.beach.code))
    .slice(0, limit)
    .map((item) => item.beach);
}
