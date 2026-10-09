"use client";

import { EPA_MPN_THRESHOLD } from "@/lib/data";
import s from "./sandbox/SandboxDashboard.module.css";

export interface LabPoint {
  date: string;
  labMpn: number;
}

const SHOWN = 36;
/** Keep the 104 line visible when a sample is far above the standard. */
const CAP = EPA_MPN_THRESHOLD * 4;

export default function LabHistory({ samples }: { samples: LabPoint[] }) {
  if (samples.length === 0) {
    return (
      <section className={s.labHistory} aria-label="Lab results">
        <h3>Lab results</h3>
        <p className={s.limitedNote}>No lab results are in the file for this beach.</p>
      </section>
    );
  }
  const shown = samples.slice(-SHOWN);
  const over = shown.filter((sample) => sample.labMpn > EPA_MPN_THRESHOLD).length;
  const clipped = shown.some((sample) => sample.labMpn > CAP);
  const summary = `${shown.length} lab results. ${over} above ${EPA_MPN_THRESHOLD} MPN/100 mL.`;
  return (
    <section className={s.labHistory} aria-label="Lab results compared with the beach standard">
      <h3>Lab results vs the limit</h3>
      <p className={s.limitedNote}>
        Each bar is a water test, not a model estimate. The line is the {EPA_MPN_THRESHOLD} MPN/100 mL enterococcus standard.
        {samples.length > shown.length ? ` Showing the most recent ${shown.length} of ${samples.length}.` : ""}
        {clipped ? " Bars taller than four times the limit are shortened so the line stays visible. The table has the measured value." : ""}
      </p>
      <svg className={s.labChart} viewBox={`0 0 ${shown.length * 12} 120`} role="img" aria-label={summary}>
        {shown.map((sample, index) => {
          const height = Math.max(2, Math.min(100, (Math.min(sample.labMpn, CAP) / CAP) * 100));
          const overLimit = sample.labMpn > EPA_MPN_THRESHOLD;
          return (
            <rect
              key={`${sample.date}-${index}`}
              x={index * 12 + 2}
              y={108 - height}
              width={8}
              height={height}
              fill={overLimit ? "#a63d36" : "#3c6435"}
            >
              <title>{`${sample.date}: ${sample.labMpn} MPN/100 mL`}</title>
            </rect>
          );
        })}
        <line
          x1={0}
          x2={shown.length * 12}
          y1={108 - (EPA_MPN_THRESHOLD / CAP) * 100}
          y2={108 - (EPA_MPN_THRESHOLD / CAP) * 100}
          stroke="#173a3c"
          strokeDasharray="3 3"
        />
      </svg>
      <details className={s.labTableWrap}>
        <summary>Lab result table</summary>
        <table className={s.labTable}>
          <caption className={s.srOnly}>Measured enterococcus compared with {EPA_MPN_THRESHOLD} MPN/100 mL</caption>
          <thead>
            <tr><th scope="col">Date</th><th scope="col">Result</th><th scope="col">Vs limit</th></tr>
          </thead>
          <tbody>
            {[...shown].reverse().map((sample) => (
              <tr key={sample.date}>
                <td>{sample.date}</td>
                <td>{sample.labMpn} MPN/100 mL</td>
                <td>{sample.labMpn > EPA_MPN_THRESHOLD ? "Over" : "Under"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
