"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { BASEMAP_ATTRIBUTION, BASEMAP_MAX_ZOOM, BASEMAP_SUBDOMAINS, BASEMAP_URL } from "@/lib/basemap";
import { bandLabel, statusPill, type Lang } from "@/lib/publicCopy";
import type { GlanceBeach } from "@/lib/publicBeach";
import { formatNeptuneIndex, publishedNeptuneScore } from "@/lib/neptuneIndex";
import { copyReading, officialPosting } from "@/lib/publishedReading";
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
  const score = beach.hasEstimate ? publishedNeptuneScore(beach.neptuneIndex, beach.neptuneBand) : null;
  if (score) {
    const label = bandLabel(score.band.id, lang);
    return score.index != null ? `${formatNeptuneIndex(score.index)} ${label}` : label;
  }
  if (beach.hasEstimate && beach.status) return statusPill(beach.status, lang);
  return lang === "es" ? "Sin estimado hoy" : "No estimate today";
}

function pinWords(beach: GlanceBeach, lang: Lang): string {
  const posting = officialPosting(copyReading(beach));
  const model = modelWords(beach, lang);
  if (!posting) return model;
  const source = posting.source ? ` (${posting.source})` : "";
  return lang === "es"
    ? `Aviso oficial: ${posting.label}${source}. Nuestro estimado: ${model}`
    : `Official posting: ${posting.label}${source}. Our estimate: ${model}`;
}

function pinColor(beach: GlanceBeach): string {
  if (officialPosting(copyReading(beach))) return "#142226";
  const score = beach.hasEstimate ? publishedNeptuneScore(beach.neptuneIndex, beach.neptuneBand) : null;
  if (score) return score.band.color;
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
          key={beach.code}
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
