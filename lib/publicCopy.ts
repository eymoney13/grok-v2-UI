import type { Status } from "./data.ts";
import { statusReading } from "./waterStatus.ts";

export type Lang = "en" | "es";

export const copy = {
  en: {
    brand: "Neptune",
    language: "Language",
    homeTitle: "Beaches near me",
    homeLead: "Today’s water quality for the closest California beaches. No account.",
    useLocation: "Use my location",
    locating: "Finding your location…",
    searchLabel: "Beach, county, or station code",
    search: "Search",
    empty: "Use your location for the closest beaches, or search by name. This page does not guess a location.",
    locationDenied: "Location is unavailable in this browser. Search by beach name, county, or station code.",
    closest: "Closest beaches",
    matches: "Matching beaches",
    noMatches: "No beach matches that. Try a county, such as Orange, or browse the whole coast.",
    far: "The closest beach on this list is about",
    away: "away.",
    showing: "Showing the first 20 matches.",
    browse: "Browse the whole coast",
    showMap: "Show these on a map",
    hideMap: "Hide map",
    loadingMap: "Loading map…",
    you: "You",
    miles: "mi",
    noEstimate: "No estimate today",
    limited: "Limited lab data",
    outsidePool: "Outside the model pool",
    forecastDate: "Forecast date",
    awaiting: "Awaiting readings",
    stale: "These readings are for",
    staleTail: ", not today.",
    fullBoard: "Lab history and the full board",
    nearby: "Nearby beaches",
    advisory: "County advisory",
    copyLink: "Copy link",
    copied: "Link copied",
    honesty: "A model estimate, not a water sample. Limited lab data and experimental forecasts stay labeled. Posted county advisories come first.",
    mapLegend: "Map colors match the words in the list.",
    footerBoard: "Full coast map",
    footerHow: "How Neptune works",
    footerIndex: "Neptune Index",
    notFound: "That beach is not on the roster.",
    backHome: "Back to beaches near me",
  },
  es: {
    brand: "Neptune",
    language: "Idioma",
    homeTitle: "Playas cerca de mí",
    homeLead: "La calidad del agua de hoy en las playas de California más cercanas. Sin cuenta.",
    useLocation: "Usar mi ubicación",
    locating: "Buscando tu ubicación…",
    searchLabel: "Playa, condado o código",
    search: "Buscar",
    empty: "Usa tu ubicación para ver las playas más cercanas, o busca por nombre. Esta página no inventa una ubicación.",
    locationDenied: "La ubicación no está disponible en este navegador. Busca por nombre de playa, condado o código.",
    closest: "Playas más cercanas",
    matches: "Playas que coinciden",
    noMatches: "Ninguna playa coincide. Prueba un condado, como Orange, o mira toda la costa.",
    far: "La playa más cercana de esta lista está a unas",
    away: "de distancia.",
    showing: "Se muestran las primeras 20 coincidencias.",
    browse: "Ver toda la costa",
    showMap: "Ver en un mapa",
    hideMap: "Ocultar mapa",
    loadingMap: "Cargando mapa…",
    you: "Tú",
    miles: "mi",
    noEstimate: "Sin estimado hoy",
    limited: "Datos de laboratorio limitados",
    outsidePool: "Fuera del grupo del modelo",
    forecastDate: "Fecha del pronóstico",
    awaiting: "En espera de lecturas",
    stale: "Estas lecturas son del",
    staleTail: ", no de hoy.",
    fullBoard: "Historial de laboratorio y el tablero completo",
    nearby: "Playas cercanas",
    advisory: "Aviso del condado",
    copyLink: "Copiar enlace",
    copied: "Enlace copiado",
    honesty: "Es un estimado del modelo, no una muestra de agua. Los datos limitados y los pronósticos experimentales siguen marcados. Los avisos del condado van primero.",
    mapLegend: "Los colores del mapa coinciden con las palabras de la lista.",
    footerBoard: "Mapa de toda la costa",
    footerHow: "Cómo funciona Neptune",
    footerIndex: "Índice Neptune",
    notFound: "Esa playa no está en la lista.",
    backHome: "Volver a playas cerca de mí",
  },
} as const;

function statusWords(status: Status, lang: Lang) {
  const reading = statusReading(status);
  return lang === "es" ? reading.es : reading;
}

export function statusPill(status: Status, lang: Lang): string {
  return statusWords(status, lang).pill;
}

export function statusPhrase(status: Status, lang: Lang): string {
  return statusWords(status, lang).phrase;
}

export function statusDetail(status: Status, lang: Lang): string {
  return statusWords(status, lang).detail;
}

/** Counties the run manifest flagged. Null when the file named none. */
export function staleCountyBanner(counties: readonly string[], lang: Lang): string | null {
  const names = counties.map((county) => county.trim()).filter((county) => county.length > 0);
  if (names.length === 0) return null;
  const list = names.join(", ");
  return lang === "es"
    ? `La última ejecución marcó estos condados como desactualizados: ${list}.`
    : `The latest run marked these counties stale: ${list}.`;
}

/** Rules path published Unknown. Neutral, and never a translation of "safe". */
export function unknownCallPhrase(lang: Lang): string {
  return lang === "es"
    ? "No hay datos recientes suficientes para decidir"
    : "Not enough recent data to call";
}
