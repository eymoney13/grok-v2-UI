import type { NeptuneBandId } from "../config/neptune-index.ts";
import { EPA_MPN_THRESHOLD, type Status } from "./data.ts";

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

const PILL: Record<Lang, Record<Status, string>> = {
  en: {
    Normal: "Under limit",
    "Slightly elevated": "Near limit",
    "Not recommended": "Over limit",
  },
  es: {
    Normal: "Bajo el límite",
    "Slightly elevated": "Cerca del límite",
    "Not recommended": "Sobre el límite",
  },
};

const PHRASE: Record<Lang, Record<Status, string>> = {
  en: {
    Normal: "under the limit",
    "Slightly elevated": "near the limit",
    "Not recommended": "over the limit",
  },
  es: {
    Normal: "bajo el límite",
    "Slightly elevated": "cerca del límite",
    "Not recommended": "sobre el límite",
  },
};

const STATUS_DETAIL: Record<Lang, Record<Status, string>> = {
  en: {
    Normal: `The model estimates enterococcus is under the ${EPA_MPN_THRESHOLD} MPN/100 mL beach standard.`,
    "Slightly elevated": `The model estimates enterococcus is higher, and still under the ${EPA_MPN_THRESHOLD} MPN/100 mL beach standard.`,
    "Not recommended": `The model estimates enterococcus may be over the ${EPA_MPN_THRESHOLD} MPN/100 mL beach standard.`,
  },
  es: {
    Normal: `El modelo estima que el enterococo está bajo el estándar de playa de ${EPA_MPN_THRESHOLD} MPN/100 mL.`,
    "Slightly elevated": `El modelo estima que el enterococo está más alto, y todavía bajo el estándar de playa de ${EPA_MPN_THRESHOLD} MPN/100 mL.`,
    "Not recommended": `El modelo estima que el enterococo puede estar sobre el estándar de playa de ${EPA_MPN_THRESHOLD} MPN/100 mL.`,
  },
};

export const BAND_LABEL: Record<Lang, Record<NeptuneBandId, string>> = {
  en: {
    good: "Good",
    moderate: "Moderate",
    caution: "Caution",
    unhealthy_for_swimming: "Unhealthy for swimming",
    unhealthy: "Unhealthy",
    hazardous: "Hazardous",
  },
  es: {
    good: "Bueno",
    moderate: "Moderado",
    caution: "Precaución",
    unhealthy_for_swimming: "No saludable para nadar",
    unhealthy: "No saludable",
    hazardous: "Peligroso",
  },
};

/** Spanish swim guidance for the public page. English stays in config/neptune-index.ts. */
export const BAND_GUIDANCE_ES: Record<NeptuneBandId, string> = {
  good: "Un número más bajo es un mejor día. Con este puntaje, nadar se ve favorable. Los avisos publicados en la playa siguen primero.",
  moderate: "La mayoría de las personas pueden nadar. Enjuágate después. Quien se enferma con más facilidad puede preferir un baño más corto.",
  caution: "Esta es la banda naranja. Empieza en el límite estatal para bacterias de playa. Los niños y quien se enferma con más facilidad deben quedarse fuera. Los demás deberían pensarlo dos veces.",
  unhealthy_for_swimming: "Quédate fuera del agua. Esta banda ya pasó el límite estatal.",
  unhealthy: "Quédate fuera del agua. Un puntaje en esta banda significa más probabilidad de enfermarse por el contacto con el agua.",
  hazardous: "Quédate fuera del agua. Es lo más alto de la escala.",
};

export function statusPill(status: Status, lang: Lang): string {
  return PILL[lang][status];
}

export function statusPhrase(status: Status, lang: Lang): string {
  return PHRASE[lang][status];
}

export function statusDetail(status: Status, lang: Lang): string {
  return STATUS_DETAIL[lang][status];
}

export function bandLabel(id: NeptuneBandId, lang: Lang): string {
  return BAND_LABEL[lang][id];
}
