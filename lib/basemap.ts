// Shared by the overview and the beach map so they cannot drift onto
// different tiles.
//
// CARTO stamps "API KEY REQUIRED" across unkeyed raster tiles. The key is
// public by nature: it travels in every tile URL the browser requests. It
// lives in the environment so this repo does not carry it.
//
// Without that key, the board uses OpenStreetMap's own tiles. Set
// NEXT_PUBLIC_CARTO_API_KEY before a public deploy so tile traffic does not
// sit on the OpenStreetMap tile servers.
//
// Read as a whole `process.env.X` expression — Next.js inlines NEXT_PUBLIC_
// vars by literal substitution at build time, so a dynamic lookup would not be
// replaced and would arrive in the browser as undefined.
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY;

/** Tile URL for Leaflet. CARTO when a key is set, otherwise OpenStreetMap. */
export const BASEMAP_URL = CARTO_KEY
  ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
  : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const BASEMAP_ATTRIBUTION = CARTO_KEY
  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const BASEMAP_SUBDOMAINS = CARTO_KEY ? "abcd" : "abc";
export const BASEMAP_MAX_ZOOM = 19;
