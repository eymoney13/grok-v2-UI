/**
 * Loose box around the West Coast, not a California shoreline.
 * It includes the Channel Islands and the monitored beaches just south of the
 * border in Baja California. Obvious placeholders such as -88, -88 and 0, 0
 * fall outside.
 */
export const WEST_COAST_BOX = {
  minLat: 31.5,
  maxLat: 42.5,
  minLon: -125,
  maxLon: -114,
};

const LOCATION_STATUS_KEYS = new Set([
  "location_status",
  "locationstatus",
  "coord_status",
  "coordinate_status",
  "coordinates_status",
  "lat_lon_status",
  "latlon_status",
  "location_quality",
  "locationquality",
]);

const LOCATION_FLAG_KEYS = new Set([
  "location_unknown",
  "locationunknown",
  "bad_location",
  "badlocation",
  "invalid_location",
  "invalidlocation",
  "location_flag",
  "locationflag",
  "coordinates_flag",
  "coordinate_flag",
]);

function foldKey(key) {
  return key.toLowerCase().replace(/[\s-]+/g, "_");
}

/** The coordinate cell itself is the word Unknown, not a number. */
export function coordinateWordUnknown(raw) {
  return typeof raw === "string" && raw.trim().toLowerCase() === "unknown";
}

function flagOn(value) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const text = value.trim().toLowerCase();
  return text === "true" || text === "yes" || text === "y" || text === "1" || text === "unknown";
}

/**
 * A location status or flag on this row says the position is unknown.
 * A water-quality `Unknown` call, `final_status`, or `posting_status` is not that flag.
 */
export function locationMarkedUnknown(row) {
  if (!row || typeof row !== "object") return false;
  for (const [key, value] of Object.entries(row)) {
    const folded = foldKey(key);
    if (LOCATION_STATUS_KEYS.has(folded) && coordinateWordUnknown(typeof value === "string" ? value : "")) return true;
    if (LOCATION_FLAG_KEYS.has(folded) && flagOn(value)) return true;
  }
  return false;
}

export function isInWestCoastBox(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= WEST_COAST_BOX.minLat &&
    latitude <= WEST_COAST_BOX.maxLat &&
    longitude >= WEST_COAST_BOX.minLon &&
    longitude <= WEST_COAST_BOX.maxLon
  );
}

export function outsideWestCoastLine(station) {
  const placed = Number.isFinite(station.latitude) && Number.isFinite(station.longitude);
  const where = placed ? `at ${station.latitude}, ${station.longitude}` : "with no published coordinates";
  const reason = station.locationUnknown
    ? `has an unknown location ${where}`
    : `is outside the West Coast box ${where}`;
  return `[coordinates] ${station.name} (${station.code}) ${reason}. It stays in the list and search, and is left off the map and out of near-me distance sorting.`;
}
