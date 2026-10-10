"use client";

import { useState, type ReactNode } from "react";
import posthog from "posthog-js";
import { ArrowRight, ArrowUpRight, Lock } from "lucide-react";
import { formatMonthDayYear, RISK_TIERS, riskTier, type BeachData, type ForecastDay, type Status } from "@/lib/data";
import { hasMapCoordinates } from "@/lib/geo";
import { buildWindowCells } from "@/lib/window";
import { beachProperties, type LockedFeature } from "@/lib/analytics";
import {
  FORECAST_EXPERIMENTAL_EXPLANATION,
  FORECAST_EXPERIMENTAL_LABEL,
  FORECAST_HIDDEN_STATION_NOTE,
  forecastHorizonFor,
} from "@/lib/forecastDisplay";
import {
  PROBABILITY_CAPTION,
  TIER_LIMITED_NOTE,
  hasLimitedLabData,
  lastTestedLabel,
  limitedLabNote,
  statusReading,
  tierReading,
} from "@/lib/waterStatus";
import {
  confidenceWords,
  copyReading,
  methodWords,
  kindTitle,
  officialPosting,
  showsUnknownCall,
  openPostingWords,
  postingLabel,
  rainAdvisoryWords,
  unknownPostingWords,
  type PublishedReading,
} from "@/lib/publishedReading";
import { unknownCallPhrase } from "@/lib/publicCopy";
import { NeptuneIndexBadge, NeptuneIndexExplainerLink, NeptuneIndexScale, scaleForDisplay } from "../NeptuneIndex";
import LabHistory, { type LabPoint } from "../LabHistory";
import WhyPrediction from "../WhyPrediction";
import ForecastAccuracy from "../ForecastAccuracy";
import s from "./SandboxDashboard.module.css";
import NeptuneMark from "./NeptuneMark";

export const bandLabel = (status: Status) => statusReading(status).title;
export const bandClass = (status: Status) => status === "Normal" ? s.low : status === "Slightly elevated" ? s.moderate : s.high;

function dateLabel(iso: string, weekday = false) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC", ...(weekday ? { weekday: "long" as const } : { month: "short" as const, day: "numeric" as const }),
  });
}

function dayIsExperimental(day: ForecastDay): boolean {
  return day.experimental !== false;
}

function ForecastLookAhead({
  forecasts,
  picked,
  onPick,
  onLocked,
}: {
  forecasts: ForecastDay[];
  picked: ForecastDay | null;
  onPick: (date: string) => void;
  onLocked: (feature: LockedFeature, date: string) => void;
}) {
  const open = forecasts.filter((day) => !day.locked);
  const allGoLive = open.length > 0 && open.every((day) => day.experimental === false);
  const mixed = open.some((day) => day.experimental === false) && open.some((day) => day.experimental !== false);
  const pickedMethod = picked ? methodWords(picked.method) : null;
  const pickedConfidence = picked ? confidenceWords(picked.confidence) : null;
  return (
    <section className={s.forecastPanel} aria-label={allGoLive ? "3-day forecast" : "Experimental 3-day forecast"}>
      <div className={s.forecastPanelHead}>
        {!allGoLive && <span className={s.experimentalBadge}>{FORECAST_EXPERIMENTAL_LABEL}</span>}
        {forecasts.some((forecast) => forecast.locked) && <span className={s.proBadge}>NEPTUNE PRO</span>}
      </div>
      <div className={s.sectionHeading}><h3>Next 3 days</h3></div>
      {!allGoLive && <p className={s.forecastExplain}>{FORECAST_EXPERIMENTAL_EXPLANATION}</p>}
      {forecasts.length > 0 ? <>
        <p className={s.supporting}>Looking ahead · {dateLabel(forecasts[0].date)}–{dateLabel(forecasts[forecasts.length - 1].date)}</p>
        <div className={s.futureDays}>{forecasts.map((forecast) => forecast.locked ? (
          <a href="#sandbox-pro" onClick={() => onLocked("three_day_forecast", forecast.date)} key={forecast.date} className={`${s.futureDay} ${s.futureLocked}`} aria-label={`${formatMonthDayYear(forecast.date)}: ${dayIsExperimental(forecast) ? "experimental forecast, " : "forecast, "}unlock with Neptune Pro`}>
            <span className={s.futureDayName}>{dateLabel(forecast.date, true)}</span>
            <span className={s.futureDate}>{dateLabel(forecast.date)}</span>
            <Lock size={18} aria-hidden="true" /><strong>Forecast</strong>
          </a>
        ) : (
          <button key={forecast.date} type="button" className={`${s.futureDay} ${forecast.callUnknown ? s.unknownCall : bandClass(forecast.status)}`} onClick={() => onPick(forecast.date)} aria-pressed={picked?.date === forecast.date} aria-label={`${formatMonthDayYear(forecast.date)}: ${dayIsExperimental(forecast) ? "experimental, " : ""}${forecast.callUnknown ? unknownCallPhrase("en") : bandLabel(forecast.status)}`}>
            <span className={s.futureDayName}>{dateLabel(forecast.date, true)}</span>
            <span className={s.futureDate}>{dateLabel(forecast.date)}</span>
            {mixed && dayIsExperimental(forecast) && <span className={s.experimentalBadge}>{FORECAST_EXPERIMENTAL_LABEL}</span>}
            <strong>{forecast.callUnknown ? unknownCallPhrase("en") : statusReading(forecast.status).pill}</strong>
          </button>
        ))}</div>
        {picked && (
          <div className={s.forecastPick}>
            <p><strong>{dateLabel(picked.date, true)}, {dateLabel(picked.date)}</strong> · {picked.callUnknown ? unknownCallPhrase("en") : statusReading(picked.status).title}</p>
            <p>{picked.callUnknown ? unknownCallPhrase("en") : statusReading(picked.status).detail}</p>
            <p>{Math.round(Math.max(0, Math.min(1, picked.probability)) * 100)}%. {PROBABILITY_CAPTION}</p>
            {pickedMethod && <p>{pickedMethod}</p>}
            {pickedConfidence && <p>{pickedConfidence.text}</p>}
          </div>
        )}
      </> : <p className={s.supporting}>The next three days are not available yet.</p>}
    </section>
  );
}

export function OfficialBanner({ reading }: { reading: PublishedReading }) {
  const posting = officialPosting(reading);
  if (!posting) return null;
  return (
    <section className={s.officialHero} aria-label={kindTitle(posting.kind)}>
      <p className={s.eyebrow}>{kindTitle(posting.kind)}</p>
      <h2>{postingLabel(posting)}</h2>
      {posting.source && <p>Source: {posting.source}</p>}
    </section>
  );
}

export function PostingAside({ reading }: { reading: PublishedReading }) {
  const text = openPostingWords(reading) ?? unknownPostingWords(reading);
  if (!text) return null;
  return <p className={s.postingQuiet}>{text}</p>;
}

export function ReadingNotes({ reading }: { reading: PublishedReading }) {
  const method = methodWords(reading.method);
  const confidence = confidenceWords(reading.confidence);
  const rain = rainAdvisoryWords(reading);
  if (!method && !confidence && !rain) return null;
  return (
    <>
      {method && <p>{method}</p>}
      {confidence && (
        <p className={confidence.level === "low" ? s.confidenceLow : confidence.level === "medium" ? s.confidenceMedium : s.confidenceHigh}>
          {confidence.text}
        </p>
      )}
      {rain && <p>{rain}</p>}
    </>
  );
}

function Figures({ probability, ours }: { probability: number; ours: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, probability)) * 100);
  return <section className={s.predictionFigures} aria-label="Estimated chance of exceeding the beach standard">
    <div>
      <p className={s.eyebrow}>{ours ? "Our estimate" : "Today’s model estimate"}</p>
      <p className={s.exceedance}><strong className={s.exceedancePct} style={{ color: riskTier(pct).textColor }}>{pct}%</strong></p>
      <p className={s.probabilityCaption}>{PROBABILITY_CAPTION}</p>
    </div>
    <dl className={s.riskKey} aria-label="What the percentage means">
      {RISK_TIERS.map((tier, index) => <div key={tier.label}>
        <span className={s.keySwatch} style={{ backgroundColor: tier.color }} aria-hidden="true" />
        <dt>{tier.range}%</dt><dd>{tierReading(index, tier.label)}</dd>
      </div>)}
    </dl>
  </section>;
}

function distanceScore(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  return Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad)
    * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
}

export default function SandboxBeachDetail({ beach, beaches, onSelect, onProMoment, advisory, alertSignup, labHistory = [] }: {
  beach: BeachData;
  beaches: Array<{ id: string; code: string; name: string; latitude: number; longitude: number; status: Status | null; hasEstimate?: boolean; neptuneDisplay?: BeachData["neptuneDisplay"]; callUnknown?: boolean; finalStatus?: string | null }>;
  onSelect: (code: string) => void;
  labHistory?: LabPoint[];
  // A locked forecast cell was tapped: the reader wanted tomorrow.
  onProMoment?: () => void;
  advisory: { label: string; href: string };
  alertSignup?: ReactNode;
}) {
  const today = buildWindowCells(beach).find((cell) => cell.type === "today")!.day;
  const reading = statusReading(today.status);
  const todayUnknown = showsUnknownCall(beach) || today.callUnknown === true;
  const indexScore = beach.neptuneDisplay;
  const readingFields = copyReading(beach);
  const posting = officialPosting(readingFields);
  const forecasts = beach.forecast.filter((day) => day.date > beach.predictionDate).slice(0, 3);
  const horizon = forecastHorizonFor(beach.code);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const picked = horizon === "label"
    ? forecasts.find((day) => day.date === pickedDate && !day.locked) ?? null
    : null;
  const tested = lastTestedLabel(beach.daysSinceSample);
  const limited = hasLimitedLabData(beach.daysSinceSample, beach.noRecentSample, beach.staleAfterDays);
  // Before onProMoment: the reader asked for this specific thing, which the
  // Pro card events alone cannot say. days_ahead 1 is "tomorrow".
  const lockedClicked = (feature: LockedFeature, date: string) => {
    posthog.capture("locked_feature_clicked", {
      board_location: "California",
      ...beachProperties(beach, "southbay"),
      feature,
      days_ahead: Math.round((Date.parse(date) - Date.parse(beach.predictionDate)) / 86_400_000),
    });
    onProMoment?.();
  };
  const nearby = hasMapCoordinates(beach)
    ? beaches.filter((candidate) => candidate.id !== beach.id && hasMapCoordinates(candidate))
      .sort((a, b) => distanceScore(beach, a) - distanceScore(beach, b) || a.id.localeCompare(b.id)).slice(0, 3)
    : [];

  return <div className={s.detail}>
    <OfficialBanner reading={readingFields} />
    {indexScore ? (
      <section
        className={s.predictionHero}
        style={{ background: indexScore.surface, color: indexScore.surfaceText }}
        aria-label="Today’s Neptune Index"
      >
        <div className={s.predictionHeader}>
          <p className={s.eyebrow}>{posting ? "Our estimate" : "Neptune Index"}</p>
          <span>{dateLabel(today.date)}</span>
        </div>
        <NeptuneIndexBadge display={indexScore} size="hero" />
        {indexScore.guidance && <p className={s.predictionExplanation}>{indexScore.guidance}</p>}
        <NeptuneIndexScale scale={scaleForDisplay(indexScore)} value={indexScore.index} compact />
        <p className={s.predictionExplanation}>
          The number comes from the model file. This page does not calculate it.{indexScore.higherIsBetter ? " A higher number is cleaner." : ""} <NeptuneIndexExplainerLink />.{" "}
          <a href={advisory.href} target="_blank" rel="noopener noreferrer" title={advisory.label}>Always follow official beach advisories. <ArrowUpRight size={16} aria-hidden="true" /></a>
        </p>
      </section>
    ) : todayUnknown ? (
    <section className={`${s.predictionHero} ${s.unknownCall}`} aria-label="Today’s estimate">
      <div className={s.predictionHeader}>
        <p className={s.eyebrow}>{posting ? "Our estimate" : "Today’s estimate"}</p>
        <span>{dateLabel(today.date)}</span>
      </div>
      <h3>{unknownCallPhrase("en")}</h3>
    </section>
    ) : (
    <section className={`${s.predictionHero} ${bandClass(today.status)}`} aria-label="Today’s estimate">
      <div className={s.predictionHeader}>
        <p className={s.eyebrow}>{posting ? "Our estimate" : "Today’s estimate"}</p>
        <span>{dateLabel(today.date)}</span>
      </div>
      <h3>{reading.title}</h3>
      <p className={s.predictionExplanation}>{reading.detail}</p>
      <div className={s.predictionNote}>
        <div className={s.scaleBar} aria-hidden="true">
          <div className={s.scaleTrack} style={{ background: "linear-gradient(to right, #97C459 0%, #97C459 25%, #EF9F27 40%, #EF9F27 55%, #E24B4A 65%, #A32D2D 100%)" }} />
          <div className={s.scaleMarker} style={{ left: `${Math.max(0, Math.min(1, today.probability)) * 100}%` }}>
            <NeptuneMark className={s.scaleMarkerLogo} />
          </div>
        </div>
        <div className={s.scaleEnds} aria-hidden="true"><span>0%</span><span>100%</span></div>
        <p>The marker sits on today’s estimated chance of a lab result above 104 MPN/100 mL. <NeptuneIndexExplainerLink />. <a href={advisory.href} target="_blank" rel="noopener noreferrer" title={advisory.label}>Always follow official beach advisories. <ArrowUpRight size={16} aria-hidden="true" /></a></p>
      </div>
    </section>
    )}
    <PostingAside reading={readingFields} />

    {(tested || limited || beach.tier === "limited_data" || beach.lastSampleDate || beach.samplingFrequency || methodWords(beach.method) || confidenceWords(beach.confidence) || rainAdvisoryWords(readingFields)) && (
      <div className={s.sampleFacts}>
        <ReadingNotes reading={readingFields} />
        {tested && <p>{tested}{beach.lastSampleDate ? ` (${beach.lastSampleDate})` : ""}</p>}
        {beach.samplingFrequency && <p>Sampling: {beach.samplingFrequency}</p>}
        {beach.tier === "model_pool" && <p>In the model pool.</p>}
        {beach.tier === "limited_data" && <p className={s.limitedNote}>{TIER_LIMITED_NOTE}</p>}
        {limited && <p className={s.limitedNote}>{limitedLabNote(beach.staleAfterDays, beach.county)}</p>}
        {beach.fallbackUsed === true && <p className={s.limitedNote}>This estimate used a fallback method.</p>}
        {beach.calibratedProbability != null && (
          <p className={s.limitedNote}>Calibrated estimate: {Math.round(beach.calibratedProbability * 100)}%. Another model figure, not a lab result.</p>
        )}
        {beach.confidenceFlag && <p className={s.limitedNote}>Pipeline note: {beach.confidenceFlag}. Not a guarantee about today.</p>}
        {beach.modelVersion && <p className={s.sampleMeta}>Model {beach.modelVersion}</p>}
      </div>
    )}
    <LabHistory samples={labHistory} />

    {!todayUnknown && <Figures probability={today.probability} ours={!!posting} />}
    <WhyPrediction
      key={today.date}
      prominentToggle
      title={indexScore || todayUnknown ? "Why today’s model estimate?" : `Why “${reading.title.toLowerCase()}” today?`}
      factors={today.factors ?? []}
      drivers={today.drivers ?? beach.drivers}
      conditions={today.conditions ?? beach.conditions}
      lastResult={today.lastResult ?? null}
      daysSinceSample={today.daysSinceSample ?? null}
      predictionDate={today.date}
      accuracy={beach.accuracy}
      hidePercent={false}
      showAccuracy={false}
    />

    {horizon === "hidden-station" && (
      <p className={s.forecastOmitted}>{FORECAST_HIDDEN_STATION_NOTE}</p>
    )}
    {horizon === "label" && (
      <ForecastLookAhead
        forecasts={forecasts}
        picked={picked}
        onPick={(date) => setPickedDate((current) => current === date ? null : date)}
        onLocked={lockedClicked}
      />
    )}
    <ForecastAccuracy accuracy={beach.accuracy} hidePercent={false} showOverallPercent cautious />
    {alertSignup}
    {nearby.length > 0 && <section className={s.nearbySection}><h3>Nearby beaches</h3><ul className={s.beaches}>{nearby.map((neighbor) => <li key={neighbor.id}><button type="button" onClick={() => onSelect(neighbor.id)}><span className={s.beachIdentity}><span className={s.beachName}>{neighbor.name}</span></span>{(() => {
              if (neighbor.neptuneDisplay) return <NeptuneIndexBadge display={neighbor.neptuneDisplay} />;
              if (showsUnknownCall(neighbor)) return <span className={s.noEstimate}>{unknownCallPhrase("en")}</span>;
              if (neighbor.hasEstimate !== false && neighbor.status) return <span className={`${s.band} ${s.listReading} ${bandClass(neighbor.status)}`}><span>{statusReading(neighbor.status).pill}</span></span>;
              return <span className={s.noEstimate}>No estimate</span>;
            })()}<ArrowRight size={16} aria-hidden="true" /></button></li>)}</ul></section>}
  </div>;
}
