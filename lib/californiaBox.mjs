/**
 * Rough box around California, including the Channel Islands and a little
 * margin. This is not a shoreline. Placeholder coordinates such as -88, -88
 * fall outside, as do 0, 0 and a positive longitude.
 */
export const CALIFORNIA_BOX = {
  minLat: 32.2,
  maxLat: 42.2,
  minLon: -124.6,
  maxLon: -114.0,
};

export function isInCaliforniaBox(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= CALIFORNIA_BOX.minLat &&
    latitude <= CALIFORNIA_BOX.maxLat &&
    longitude >= CALIFORNIA_BOX.minLon &&
    longitude <= CALIFORNIA_BOX.maxLon
  );
}

export function outsideCaliforniaLine(station) {
  return `[coordinates] ${station.name} (${station.code}) is outside the California box at ${station.latitude}, ${station.longitude}. It stays in the list and search, and is left off the map and out of near-me distance sorting.`;
}
