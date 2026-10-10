import Link from "next/link";
import {
  bandWidths,
  displayBandLabel,
  indexConfidenceNote,
  indexScalePhrase,
  type IndexScale,
  type NeptuneDisplay,
} from "@/lib/neptuneIndex";

export function NeptuneIndexBadge({
  display,
  size = "list",
  lang = "en",
}: {
  display: NeptuneDisplay;
  size?: "list" | "hero";
  lang?: "en" | "es";
}) {
  const phrase = indexScalePhrase(display, lang);
  const label = displayBandLabel(display, lang);
  const note = indexConfidenceNote(display, lang);
  return (
    <span className="nb-index-stack">
      <span
        className={`nb-index-badge nb-index-badge--${size}${display.lowered ? " nb-index-badge--lowered" : ""}`}
        style={display.lowered ? undefined : { background: display.color, color: display.textColor }}
      >
        <span className="nb-index-badge-copy">
          {phrase && <strong>{phrase}</strong>}
          {label && <span>{label}</span>}
        </span>
      </span>
      {note && <span className="nb-index-note">{note}</span>}
    </span>
  );
}

export function NeptuneIndexScale({
  scale,
  value = null,
  compact = false,
}: {
  scale: IndexScale | null;
  value?: number | null;
  compact?: boolean;
}) {
  if (!scale || scale.bands.length === 0) return null;
  const bands = [...scale.bands].sort((a, b) => a.min - b.min || a.max - b.max);
  const widths = bandWidths(bands);
  const span = scale.scaleMax - scale.scaleMin;
  const marker =
    value != null && Number.isFinite(value) && span > 0
      ? Math.max(0, Math.min(1, (value - scale.scaleMin) / span))
      : null;
  return (
    <div className={compact ? "nb-index-scale-block nb-index-scale-block--compact" : "nb-index-scale-block"}>
      <div className="nb-index-bar" aria-hidden="true">
        {bands.map((band, index) => (
          <span key={band.id} style={{ width: `${(widths[index] ?? 0) * 100}%`, background: band.color }} />
        ))}
        {marker != null && <i className="nb-index-marker" style={{ left: `${marker * 100}%` }} />}
      </div>
      <div className="nb-index-ends" aria-hidden="true">
        <span>{scale.scaleMin}</span>
        <span>{scale.higherIsBetter ? `${scale.scaleMax} cleaner` : scale.scaleMax}</span>
      </div>
      {scale.higherIsBetter && <p className="nb-index-direction">Higher is cleaner.</p>}
      <ol className="nb-index-key">
        {bands.map((band) => (
          <li key={band.id}>
            <span className="nb-index-swatch" style={{ background: band.color }} aria-hidden="true" />
            <span className="nb-index-key-name">
              <strong>{band.label}</strong>
              <span>
                {band.min}–{band.max}
              </span>
            </span>
            {!compact && band.guidance && <p>{band.guidance}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function scaleForDisplay(display: NeptuneDisplay): IndexScale | null {
  if (display.bands.length === 0) return null;
  return {
    scaleMin: display.scaleMin,
    scaleMax: display.scaleMax,
    higherIsBetter: display.higherIsBetter,
    bands: display.bands,
    tiers: {},
  };
}

export function NeptuneIndexExplainerLink({ className }: { className?: string }) {
  return (
    <Link className={className ?? "nb-index-link"} href="/california/neptune-index">
      Neptune Index scale
    </Link>
  );
}
