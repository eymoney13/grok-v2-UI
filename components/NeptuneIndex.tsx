import Link from "next/link";
import {
  bandWidths,
  DEFAULT_DETECTION,
  indexReading,
  scaleGroups,
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
  const reading = indexReading(display, lang);
  if (!reading.label) {
    return (
      <span className={`nb-index-plain nb-index-plain--${size}`}>
        {reading.phrase && <strong>{reading.phrase}</strong>}
        {reading.note && <span className="nb-index-note">{reading.note}</span>}
      </span>
    );
  }
  return (
    <span className="nb-index-stack">
      <span
        className={`nb-index-badge nb-index-badge--${size}${display.lowered ? " nb-index-badge--lowered" : ""}`}
        style={display.lowered ? undefined : { background: display.color, color: display.textColor }}
      >
        <span className="nb-index-badge-copy">
          <strong>{reading.label}</strong>
          {reading.phrase && <span>{reading.phrase}</span>}
        </span>
      </span>
      {reading.note && <span className="nb-index-note">{reading.note}</span>}
    </span>
  );
}

export function NeptuneIndexScale({
  scale,
  value = null,
  compact = false,
  title = null,
}: {
  scale: IndexScale | null;
  value?: number | null;
  compact?: boolean;
  title?: string | null;
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
      {title && <p className="nb-index-tier">{title}</p>}
      <div className="nb-index-bar" aria-hidden="true">
        {bands.map((band, index) => (
          <span key={band.id} style={{ width: `${(widths[index] ?? 0) * 100}%`, background: band.color }} />
        ))}
        {marker != null && <i className="nb-index-marker" style={{ left: `${marker * 100}%` }} />}
      </div>
      <div className="nb-index-ends" aria-hidden="true">
        <span>{scale.higherIsBetter ? scale.scaleMin : `${scale.scaleMin} cleaner`}</span>
        <span>{scale.higherIsBetter ? `${scale.scaleMax} cleaner` : scale.scaleMax}</span>
      </div>
      <p className="nb-index-direction">{scale.higherIsBetter ? "Higher is cleaner." : "Lower is cleaner."}</p>
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
    formula: null,
    detection: DEFAULT_DETECTION,
  };
}

/** One block per tier table. A tier can list any number of bands. */
export function NeptuneIndexLegend({
  scale,
  compact = false,
}: {
  scale: IndexScale | null;
  compact?: boolean;
}) {
  const groups = scaleGroups(scale);
  if (groups.length === 0 || !scale) return null;
  return (
    <div className="nb-index-legend">
      {groups.map((group) => (
        <NeptuneIndexScale
          key={group.key}
          title={groups.length > 1 ? group.title : null}
          compact={compact}
          scale={{ ...scale, bands: group.bands, tiers: {} }}
        />
      ))}
    </div>
  );
}

export function NeptuneIndexExplainerLink({ className }: { className?: string }) {
  return (
    <Link className={className ?? "nb-index-link"} href="/california/neptune-index">
      Neptune Index scale
    </Link>
  );
}
