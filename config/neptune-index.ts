/**
 * Neptune Index display scale. The model publishes `neptune_index` and
 * `neptune_band`. This file does not turn a lab result or a probability into
 * a score.
 *
 * Six bands, 0 through 500, in the same order as the air-quality index:
 * green, yellow, orange, red, purple, maroon. The orange band is `caution`.
 * Its `min` is the boundary that corresponds to the state enterococcus limit.
 * `color` / `textColor` are the badge and map pin. `surface` / `surfaceText`
 * are the detail card behind the guidance. Both pairs are chosen for contrast.
 */
export const NEPTUNE_INDEX = {
  scaleMin: 0,
  scaleMax: 500,
  limitBandId: "caution",
  bands: [
    {
      id: "good",
      level: 1,
      label: "Good",
      pin: "Good",
      min: 0,
      max: 50,
      color: "#137333",
      textColor: "#ffffff",
      surface: "#e5f4ea",
      surfaceText: "#0d4d22",
      guidance: "A lower score is a better day. Swimming looks favorable from this score. Posted beach advisories still come first.",
    },
    {
      id: "moderate",
      level: 2,
      label: "Moderate",
      pin: "Moderate",
      min: 51,
      max: 100,
      color: "#f6de4a",
      textColor: "#1c1600",
      surface: "#fbf6d4",
      surfaceText: "#3f3500",
      guidance: "Most people can swim. Rinse off afterward. People who get sick more easily may want a shorter swim.",
    },
    {
      id: "caution",
      level: 3,
      label: "Caution",
      pin: "Caution",
      min: 101,
      max: 150,
      color: "#e06a00",
      textColor: "#1a0d00",
      surface: "#fff1e0",
      surfaceText: "#6a2e00",
      guidance: "This is the orange band. It starts at the state limit for beach bacteria. Children and anyone more likely to get sick should stay out. Everyone else should think twice.",
    },
    {
      id: "unhealthy_for_swimming",
      level: 4,
      label: "Unhealthy for swimming",
      pin: "No swim",
      min: 151,
      max: 200,
      color: "#c62828",
      textColor: "#ffffff",
      surface: "#fdecea",
      surfaceText: "#7a1414",
      guidance: "Stay out of the water. This band is past the state limit.",
    },
    {
      id: "unhealthy",
      level: 5,
      label: "Unhealthy",
      pin: "Unhealthy",
      min: 201,
      max: 300,
      color: "#6a1b9a",
      textColor: "#ffffff",
      surface: "#f6e8fb",
      surfaceText: "#4a1268",
      guidance: "Stay out of the water. A score in this band means a higher chance of getting sick from contact with the water.",
    },
    {
      id: "hazardous",
      level: 6,
      label: "Hazardous",
      pin: "Hazardous",
      min: 301,
      max: 500,
      color: "#7e0023",
      textColor: "#ffffff",
      surface: "#f8e6ea",
      surfaceText: "#5c0d1a",
      guidance: "Stay out of the water. This is the top of the scale.",
    },
  ],
} as const;

export type NeptuneBand = (typeof NEPTUNE_INDEX.bands)[number];
export type NeptuneBandId = NeptuneBand["id"];
