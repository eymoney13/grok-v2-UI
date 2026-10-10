"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, Waves } from "lucide-react";
import type { BeachData, BeachListItem } from "@/lib/data";
import { formatMonthDayYear } from "@/lib/data";
import type { LastUpdatedDisplay } from "@/lib/waterStatus";
import { assignSlugs } from "@/lib/beachSlug";
import { TIER_LIMITED_NOTE, lastTestedLabel, limitedLabNote, hasLimitedLabData } from "@/lib/waterStatus";
import ProjectNeptuneLogo from "../ProjectNeptuneLogo";
import SandboxBeachDetail from "./SandboxBeachDetail";
import SandboxProOffer from "./SandboxProOffer";
import LabHistory from "../LabHistory";
import SandboxSupportLinks from "./SandboxSupportLinks";
import s from "./SandboxDashboard.module.css";

export default function CaliforniaBeachPage({
  beach,
  listItem,
  neighbors,
  choices,
  labHistory,
  updated,
  readingsCurrent,
  predictionDate,
  entitled,
  checkoutReady,
  alertsEnabled,
  advisory,
  backTo,
  account,
}: {
  beach: BeachData | null;
  listItem: BeachListItem;
  neighbors: BeachListItem[];
  choices: BeachListItem[];
  labHistory: { date: string; labMpn: number }[];
  updated: LastUpdatedDisplay;
  readingsCurrent: boolean;
  predictionDate: string | null;
  entitled: boolean;
  checkoutReady: boolean;
  alertsEnabled: boolean;
  advisory: { label: string; href: string };
  backTo: "list" | "map";
  account: ReactNode;
}) {
  const router = useRouter();
  const tested = lastTestedLabel(listItem.daysSinceSample);
  const limited = hasLimitedLabData(listItem.daysSinceSample, listItem.noRecentSample, listItem.staleAfterDays);
  const shareSlug = assignSlugs([listItem, ...choices].map((beach) => ({ code: beach.code, name: beach.name }))).get(listItem.code);
  return (
    <main className={s.root}>
      <header className={s.header}>
        <a href="https://projectneptune.co" aria-label="Project Neptune home"><ProjectNeptuneLogo size={22} /></a>
        <div className={s.account}>{account}</div>
      </header>
      <div className={s.content}>
        <div className={s.beachNav}>
          <Link href={`/california?view=${backTo}`}><ArrowLeft size={17} /> Back to {backTo === "list" ? "beaches" : "map"}</Link>
          <label>
            <span className={s.srOnly}>Choose a beach</span>
            <select
              value={listItem.code}
              onChange={(event) => router.push(`/california/beach/${encodeURIComponent(event.target.value)}?from=${backTo}`)}
            >
              {[listItem, ...choices.filter((choice) => choice.code !== listItem.code)]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((choice) => <option key={choice.code} value={choice.code}>{choice.name}</option>)}
            </select>
          </label>
        </div>
        <h1 className={s.beachHeading}>{listItem.name}</h1>
        {shareSlug && <p className={s.supporting}><Link href={`/beach/${shareSlug}`}>Shareable page</Link></p>}
        {listItem.county && <p className={s.supporting}>{[listItem.county, listItem.region].filter(Boolean).join(" · ")}</p>}
        <p className={s.dateline}><span>Last updated</span> <strong>{updated.dateTime ? <time dateTime={updated.dateTime}>{updated.text}</time> : updated.text}</strong></p>
        {predictionDate && !readingsCurrent && (
          <p className={s.stale} role="status">These readings are for {formatMonthDayYear(predictionDate)}, not today.</p>
        )}
        {beach ? (
          <SandboxBeachDetail
            beach={beach}
            beaches={neighbors}
            labHistory={labHistory}
            onSelect={(code) => router.push(`/california/beach/${encodeURIComponent(code)}?from=${backTo}`)}
            advisory={advisory}
          />
        ) : (
          <div className={s.detail}>
            <section className={s.empty} aria-label="No estimate today">
              <h2>No estimate today</h2>
              <p>This beach is on the roster, and the files do not include a model estimate for it. Nothing here is filled in.</p>
            </section>
            <div className={s.sampleFacts}>
              {tested && <p>{tested}{listItem.lastSampleDate ? ` (${listItem.lastSampleDate})` : ""}</p>}
              {listItem.samplingFrequency && <p>Sampling: {listItem.samplingFrequency}</p>}
              {listItem.tier === "limited_data" && <p className={s.limitedNote}>{TIER_LIMITED_NOTE}</p>}
              {limited && <p className={s.limitedNote}>{limitedLabNote(listItem.staleAfterDays, listItem.county)}</p>}
            </div>
            <LabHistory samples={labHistory} />
          </div>
        )}
        {!entitled && beach && (
          <SandboxProOffer checkoutReady={checkoutReady} alertsEnabled={alertsEnabled} ctaLocation="beach_forecast_lock" pageContext="beach_page" beach={beach} />
        )}
      </div>
      <footer className={s.footer}>
        <Waves size={20} />
        <p>Know the water. Enjoy the coast.</p>
        <small>Forecasts are estimates based on environmental data. For official beach advisories, consult <a href={advisory.href} target="_blank" rel="noopener noreferrer">{advisory.label}</a>.</small>
        <SandboxSupportLinks />
      </footer>
    </main>
  );
}
