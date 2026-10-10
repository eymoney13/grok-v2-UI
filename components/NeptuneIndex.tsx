import Link from "next/link";
import { NEPTUNE_INDEX } from "@/config/neptune-index";
import {
  bandWidth,
  formatNeptuneIndex,
  neptuneIndexName,
  type NeptuneScore,
} from "@/lib/neptuneIndex";

export function NeptuneIndexBadge({
  score,
  size = "list",
}: {
  score: NeptuneScore;
  size?: "list" | "hero";
}) {
  return (
    <span
      className={`nb-index-badge nb-index-badge--${size}`}
      style={{ background: score.band.color, color: score.band.textColor }}
      aria-label={neptuneIndexName(score)}
    >
      <span className="nb-index-badge-level" aria-hidden="true">
        {score.band.level}
      </span>
      <span className="nb-index-badge-copy">
        {score.index != null && <strong>{formatNeptuneIndex(score.index)}</strong>}
        <span>{score.band.label}</span>
      </span>
    </span>
  );
}

export function NeptuneIndexScale({
  value = null,
  compact = false,
}: {
  value?: number | null;
  compact?: boolean;
}) {
  const marker =
    value != null && Number.isFinite(value)
      ? Math.max(0, Math.min(1, (value - NEPTUNE_INDEX.scaleMin) / (NEPTUNE_INDEX.scaleMax - NEPTUNE_INDEX.scaleMin)))
      : null;
  return (
    <div className={compact ? "nb-index-scale-block nb-index-scale-block--compact" : "nb-index-scale-block"}>
      <div className="nb-index-bar" aria-hidden="true">
        {NEPTUNE_INDEX.bands.map((band) => (
          <span key={band.id} style={{ width: `${bandWidth(band) * 100}%`, background: band.color }} />
        ))}
        {marker != null && <i className="nb-index-marker" style={{ left: `${marker * 100}%` }} />}
      </div>
      <div className="nb-index-ends" aria-hidden="true">
        <span>{NEPTUNE_INDEX.scaleMin}</span>
        <span>{NEPTUNE_INDEX.scaleMax}</span>
      </div>
      <ol className="nb-index-key">
        {NEPTUNE_INDEX.bands.map((band) => (
          <li key={band.id}>
            <span className="nb-index-swatch" style={{ background: band.color }} aria-hidden="true" />
            <span className="nb-index-key-name">
              <strong>
                {band.level}. {band.label}
              </strong>
              <span>
                {band.min}–{band.max}
              </span>
            </span>
            {!compact && <p>{band.guidance}</p>}
          </li>
        ))}
      </ol>
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
