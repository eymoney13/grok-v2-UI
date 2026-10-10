"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { BASEMAP_ATTRIBUTION, BASEMAP_MAX_ZOOM, BASEMAP_SUBDOMAINS, BASEMAP_URL } from "@/lib/basemap";
import { statusPill, unknownCallPhrase, type Lang } from "@/lib/publicCopy";
import type { GlanceBeach } from "@/lib/publicBeach";
import { displayBandLabel, indexConfidenceNote, indexScalePhrase } from "@/lib/neptuneIndex";
import { copyReading, kindTitle, officialPosting, openPostingWords, postingLabel, showsUnknownCall } from "@/lib/publishedReading";
import "leaflet/dist/leaflet.css";

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(points, { padding: [28, 28] });
  }, [map, points]);
  return null;
}

function modelWords(beach: GlanceBeach, lang: Lang): string {
  const display = beach.neptuneDisplay;
  if (display) {
    return [indexScalePhrase(display, lang), displayBandLabel(display, lang), indexConfidenceNote(display, lang)]
      .filter((part) => !!part)
      .join(", ");
  }
  if (showsUnknownCall(beach)) return unknownCallPhrase(lang);
  if (beach.hasEstimate && beach.status) return statusPill(beach.status, lang);
  return lang === "es" ? "Sin estimado hoy" : "No estimate today";
}

function pinWords(beach: GlanceBeach, lang: Lang): string {
  const reading = copyReading(beach);
  const posting = officialPosting(reading);
  const model = modelWords(beach, lang);
  if (posting) {
    const source = posting.source ? ` (${posting.source})` : "";
    const title = kindTitle(posting.kind, lang);
    const label = postingLabel(posting, lang);
    return lang === "es"
      ? `${title}: ${label}${source}. Nuestro estimado: ${model}`
      : `${title}: ${label}${source}. Our estimate: ${model}`;
  }
  const open = openPostingWords(reading, lang);
  return open ? `${model}. ${open}` : model;
}

function pinColor(beach: GlanceBeach): string {
  if (officialPosting(copyReading(beach))) return "#142226";
  if (beach.neptuneDisplay) return beach.neptuneDisplay.color;
  if (showsUnknownCall(beach)) return "#66777b";
  if (beach.status === "Normal") return "#3c6435";
  if (beach.status === "Slightly elevated") return "#786016";
  if (beach.status === "Not recommended") return "#a63d36";
  return "#66777b";
}

export default function PublicMap({
  beaches,
  user,
  youLabel,
  lang,
}: {
  beaches: GlanceBeach[];
  user: { latitude: number; longitude: number } | null;
  youLabel: string;
  lang: Lang;
}) {
  const points: [number, number][] = beaches
    .filter((beach) => Number.isFinite(beach.latitude) && Number.isFinite(beach.longitude))
    .map((beach) => [beach.latitude, beach.longitude]);
  if (user) points.push([user.latitude, user.longitude]);
  if (points.length === 0) return null;
  return (
    <MapContainer center={points[0]} zoom={11} scrollWheelZoom={false}>
      <TileLayer
        attribution={BASEMAP_ATTRIBUTION}
        url={BASEMAP_URL}
        subdomains={BASEMAP_SUBDOMAINS}
        maxZoom={BASEMAP_MAX_ZOOM}
      />
      <Fit points={points} />
      {user && (
        <CircleMarker center={[user.latitude, user.longitude]} radius={8} pathOptions={{ color: "#0e6f78", fillColor: "#0e6f78", fillOpacity: 0.9 }}>
          <Popup>{youLabel}</Popup>
        </CircleMarker>
      )}
      {beaches.map((beach) => (
        <CircleMarker
          key={beach.slug}
          center={[beach.latitude, beach.longitude]}
          radius={9}
          pathOptions={{ color: "#fff", weight: 2, fillColor: pinColor(beach), fillOpacity: 1 }}
        >
          <Popup>
            <a href={`/beach/${beach.slug}`}>{beach.name}</a>
            <br />
            {pinWords(beach, lang)}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
