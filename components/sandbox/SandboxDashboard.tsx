"use client";
import SandboxSupportLinks from "@/components/sandbox/SandboxSupportLinks";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import posthog from "posthog-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ArrowRight, ChevronRight, List, Map as MapIcon, Waves } from "lucide-react";
import { formatMonthDayYear, type BeachListItem, type DataSourceName, type Status } from "@/lib/data";
import { lookAheadOfferLine } from "@/lib/forecastDisplay";
import { statewideStatusHeadline } from "@/lib/statewideCounts";
import { labFreshnessLine, statusReading, type LastUpdatedDisplay } from "@/lib/waterStatus";
import type { IndexScale } from "@/lib/neptuneIndex";
import { staleCountyBanner } from "@/lib/publicCopy";
import { confidenceWords, copyReading, methodShort, officialPosting, openPostingWords, postingHeadline, showsUnknownCall } from "@/lib/publishedReading";
import { unknownCallPhrase } from "@/lib/publicCopy";
import { NeptuneIndexBadge, NeptuneIndexExplainerLink, NeptuneIndexLegend } from "../NeptuneIndex";
import type { NewsItem } from "@/lib/news";
import type { CtaLocation } from "@/lib/analytics";
import ProjectNeptuneLogo from "../ProjectNeptuneLogo";
import OverviewMapClient from "../OverviewMapClient";
import NewsTab from "../NewsTab";
import { bandClass } from "./SandboxBeachDetail";
import SandboxProOffer from "./SandboxProOffer";
import SandboxMenu from "./SandboxMenu";
import CaliforniaAlertSignup, { type CaliforniaAlertSignupHandle } from "@/components/CaliforniaAlertSignup";
import SandboxYourNeptune from "./SandboxYourNeptune";
import s from "./SandboxDashboard.module.css";

const COUNTY_PAGE = 40;

export interface BoardRun {
  source: DataSourceName;
  staleCounties: string[];
  checksPassed: boolean | null;
  modelVersion: string | null;
}

export default function SandboxDashboard({
  beaches,
  predictionDate,
  updated,
  readingsCurrent,
  fallbackCenter,
  entitled,
  alertsEnabled,
  checkoutReady,
  openForecast = false,
  account,
  faq,
  news,
  newsEnabled,
  advisory,
  run,
  indexScale = null,
  initialView = "map",
  initialRegion = "",
}: {
  beaches: BeachListItem[];
  predictionDate: string | null;
  updated: LastUpdatedDisplay;
  readingsCurrent: boolean;
  fallbackCenter: [number, number];
  entitled: boolean;
  alertsEnabled: boolean;
  checkoutReady: boolean;
  openForecast?: boolean;
  account: ReactNode;
  faq: ReactNode;
  news: NewsItem[];
  newsEnabled: boolean;
  advisory: { label: string; href: string };
  run: BoardRun;
  indexScale?: IndexScale | null;
  initialView?: "list" | "map" | "news";
  initialRegion?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [countyFilter, setCountyFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"list" | "map" | "news">(initialView === "news" && newsEnabled ? "news" : initialView === "list" ? "list" : "map");
  const heading = useRef<HTMLHeadingElement>(null);
  const alertSignupRef = useRef<CaliforniaAlertSignupHandle>(null);

  useEffect(() => {
    posthog.capture("water_quality_dashboard_viewed", { board_location: "California", region: "california", access: entitled ? "pro" : "free" });
    if (openForecast && entitled && beaches[0]) {
      posthog.capture("pro_activation_dashboard_opened", { board_location: "California" });
      router.push(`/california/beach/${encodeURIComponent(beaches[0].code)}?from=map`);
    }
  }, [entitled, openForecast, beaches, router]);

  const regions = useMemo(() => unique(beaches.map((beach) => beach.region).filter((region): region is string => !!region)), [beaches]);
  const counties = useMemo(() => unique(beaches.map((beach) => beach.county ?? "County not listed")), [beaches]);
  const showTier = beaches.some((beach) => beach.tier);

  useEffect(() => {
    if (!initialRegion) return;
    const wanted = initialRegion.trim().toLowerCase();
    const match = regions.find((region) => region.toLowerCase() === wanted);
    if (match) setRegionFilter(match);
  }, [initialRegion, regions]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = beaches.filter((beach) => {
    if (countyFilter && (beach.county ?? "County not listed") !== countyFilter) return false;
    if (regionFilter && beach.region !== regionFilter) return false;
    if (tierFilter && beach.tier !== tierFilter) return false;
    if (statusFilter === "none" && beach.hasEstimate) return false;
    if ((statusFilter === "under" || statusFilter === "near" || statusFilter === "over") && showsUnknownCall(beach)) return false;
    if (statusFilter === "under" && beach.status !== "Normal") return false;
    if (statusFilter === "near" && beach.status !== "Slightly elevated") return false;
    if (statusFilter === "over" && beach.status !== "Not recommended") return false;
    if (!normalizedQuery) return true;
    const haystack = `${beach.name} ${beach.county ?? ""} ${beach.region ?? ""} ${beach.code}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const ordered = [...filtered].sort((a, b) => b.latitude - a.latitude || a.name.localeCompare(b.name));
  const groups = groupByCounty(ordered);
  const coastCount = statewideStatusHeadline(beaches);
  const staleCounties = staleCountyBanner(run.staleCounties, "en");
  const filtersOn = !!(normalizedQuery || countyFilter || regionFilter || statusFilter || tierFilter);
  const offerLine = lookAheadOfferLine(alertsEnabled);

  const openBeach = (id: string) => {
    const beach = beaches.find((item) => item.id === id);
    if (beach) {
      posthog.capture("beach_viewed", {
        board_location: "California",
        beach_id: beach.id,
        beach_name: beach.name,
        region: beach.region ?? beach.county ?? "california",
        entry_point: view,
      });
    }
    router.push(`/california/beach/${encodeURIComponent(beach?.id ?? id)}?from=${view}`);
  };
  const switchView = (next: typeof view) => {
    setView(next);
    posthog.capture("dashboard_view_selected", { board_location: "California", region: "california", view: next });
  };
  const clearFilters = () => {
    setQuery("");
    setCountyFilter("");
    setRegionFilter("");
    setStatusFilter("");
    setTierFilter("");
  };

  const alertSignup = alertsEnabled && view !== "news" ? (
    <CaliforniaAlertSignup
      ref={alertSignupRef}
      key={view}
      beaches={beaches.map((beach) => ({ id: beach.id, code: beach.code, name: beach.name }))}
      pro={entitled}
      onSaved={() => {}}
      source={`california_${view}`}
    />
  ) : null;

  return (
    <main className={s.root}>
      <header className={s.header}>
        <a href="https://projectneptune.co" aria-label="Project Neptune home"><ProjectNeptuneLogo size={22} /></a>
        <div className={s.account}>{!entitled && <a className={s.headerPro} href="#sandbox-pro">Get Pro</a>}{entitled && <UserButton />}<SandboxMenu account={account} /></div>
      </header>
      <div className={s.content}>
        <div className={s.masthead}>
          <div>
            <p className={s.eyebrow}><Waves size={16} /> Daily water-quality</p>
            <h1>Neptune Index</h1>
            <p className={s.intro}>California beach estimates against the 104 MPN/100 mL enterococcus limit.</p>
          </div>
          <div className={s.dateline}><span>Last updated</span><strong>{updated.dateTime ? <time dateTime={updated.dateTime}>{updated.text}</time> : updated.text}</strong></div>
        </div>
        <div className={s.toolbar}>
          <nav aria-label="Dashboard views" className={s.tabs}>
            <button type="button" aria-current={view === "list" ? "page" : undefined} onClick={() => switchView("list")}><List size={17} /> Beaches</button>
            <button type="button" aria-current={view === "map" ? "page" : undefined} onClick={() => switchView("map")}><MapIcon size={17} /> Map</button>
            {newsEnabled && <button type="button" aria-current={view === "news" ? "page" : undefined} onClick={() => switchView("news")}>News</button>}
          </nav>
          <div className={s.mobileDateline}>
            <span>Updated</span>
            {updated.dateTime ? <time dateTime={updated.dateTime}>{updated.short}</time> : <span>{updated.short}</span>}
          </div>
        </div>
        {predictionDate && !readingsCurrent && (
          <p className={s.stale} role="status">These readings are for {formatMonthDayYear(predictionDate)}, not today.</p>
        )}
        {run.checksPassed === false && (
          <p className={s.stale} role="status">The latest model run reported a check that did not pass. Treat today’s estimates with extra caution.</p>
        )}
        {staleCounties && (
          <p className={s.stale} role="status">{staleCounties}</p>
        )}
        {!entitled && view === "list" && (
          <aside className={s.proBanner} aria-label="Join Neptune Pro">
            <div><strong>Checking the water should be as easy as checking the weather.</strong><p>{offerLine}</p></div>
            <a href="#sandbox-pro">Join Neptune Pro <ArrowRight size={16} aria-hidden="true" /></a>
          </aside>
        )}
        {beaches.length === 0 ? (
          <div className={s.empty}><h2>No readings published yet.</h2><p>The daily forecast will appear here when it is available.</p></div>
        ) : view === "news" ? <NewsTab items={news} /> : (
          <section className={s.overview}>
            <div className={s.sectionHeading}>
              <h2 ref={heading} tabIndex={-1}>Today’s water quality</h2>
              <span>{filtersOn ? `${filtered.length} of ${beaches.length}` : beaches.length} beaches</span>
            </div>
            {coastCount && <p className={s.supporting}>{coastCount}</p>}
            <p className={s.supporting}>Search or filter, then open a beach for today’s estimate.{alertsEnabled && <> <button type="button" className={s.emailAlertLink} onClick={() => alertSignupRef.current?.open()}>Get email alerts</button></>}</p>
            <div className={s.searchRow}>
              <label className={s.searchLabel}>
                <span className={s.srOnly}>Search beaches</span>
                <input
                  type="search"
                  value={query}
                  placeholder="Search beaches, counties, or station codes"
                  autoComplete="off"
                  onChange={(event) => setQuery(event.target.value)}
                  aria-controls={view === "list" ? "beach-list" : "beach-map"}
                />
              </label>
            </div>
            <div className={s.filters}>
              <label>County
                <select value={countyFilter} onChange={(event) => setCountyFilter(event.target.value)}>
                  <option value="">All counties</option>
                  {counties.map((county) => <option key={county} value={county}>{county}</option>)}
                </select>
              </label>
              {regions.length > 0 && (
                <label>Region
                  <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
                    <option value="">All regions</option>
                    {regions.map((region) => <option key={region} value={region}>{region}</option>)}
                  </select>
                </label>
              )}
              <label>Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="under">{statusReading("Normal").title}</option>
                  <option value="near">{statusReading("Slightly elevated").title}</option>
                  <option value="over">{statusReading("Not recommended").title}</option>
                  <option value="none">No estimate today</option>
                </select>
              </label>
              {showTier && (
                <label>Roster
                  <select value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}>
                    <option value="">All beaches</option>
                    <option value="model_pool">In the model pool</option>
                    <option value="limited_data">Limited data</option>
                  </select>
                </label>
              )}
              {filtersOn && <button type="button" className={s.clearFilters} onClick={clearFilters}>Clear filters</button>}
            </div>
            <p className={s.srOnly} role="status" aria-live="polite">{filtersOn ? `${filtered.length} of ${beaches.length} beaches` : `${beaches.length} beaches`}</p>
            {filtered.length === 0 ? (
              <p className={s.emptySearch} role="status">No beaches match these filters.{query.trim() ? ` Nothing matches “${query.trim()}”.` : ""}</p>
            ) : view === "map" ? (
              <div className={s.map} id="beach-map">
                <OverviewMapClient
                  locateNearby
                  cluster
                  labelMinZoom={12}
                  beaches={ordered}
                  fallbackCenter={fallbackCenter}
                  binaryVerdict={false}
                  statusPhrase={(status: Status) => statusReading(status).title}
                  onSelect={openBeach}
                />
              </div>
            ) : (
              <div className={s.countyGroups} id="beach-list">
                {groups.map((group) => {
                  const shown = filtersOn || expanded[group.county] ? group.beaches : group.beaches.slice(0, COUNTY_PAGE);
                  return (
                    <section key={group.county} aria-label={group.county}>
                      <h3 className={s.countyHeading}>{group.county}<span>{group.beaches.length} {group.beaches.length === 1 ? "beach" : "beaches"}</span></h3>
                      <ul className={s.beaches}>
                        {shown.map((beach) => {
                          const freshness = labFreshnessLine(beach.daysSinceSample, beach.noRecentSample, beach.staleAfterDays);
                          return (
                            <li key={beach.id}>
                              <button type="button" onClick={() => openBeach(beach.id)}>
                                <span className={s.beachIdentity}>
                                  <span className={s.beachName}>{beach.name}</span>
                                  {freshness && <span className={s.sampleMeta}>{freshness}</span>}
                                  {beach.tier === "limited_data" && <span className={s.sampleMeta}>Outside the model pool</span>}
                                </span>
                                {(() => {
                                  const reading = copyReading(beach);
                                  const posting = officialPosting(reading);
                                  const headline = posting ? postingHeadline(posting) : null;
                                  const open = openPostingWords(reading);
                                  const score = beach.neptuneDisplay;
                                  const confidence = confidenceWords(beach.confidence);
                                  const method = methodShort(beach.method);
                                  const estimate = score ? (
                                    <NeptuneIndexBadge display={score} />
                                  ) : showsUnknownCall(beach) ? (
                                    <span className={s.noEstimate}>{unknownCallPhrase("en")}</span>
                                  ) : beach.hasEstimate && beach.status ? (
                                    <span className={`${s.band} ${s.listReading} ${bandClass(beach.status)}`}>
                                      <span className={s.listBandLabel}><span className={s.dot} />{statusReading(beach.status).pill}</span>
                                    </span>
                                  ) : (
                                    <span className={s.noEstimate}>No estimate</span>
                                  );
                                  return (
                                    <span className={s.readingStack}>
                                      {headline && (
                                        <span className={s.officialList}>
                                          <span>{headline.title}</span>
                                          {headline.detail && <strong>{headline.detail}</strong>}
                                          {posting?.source && <small>Source: {posting.source}</small>}
                                        </span>
                                      )}
                                      <span className={posting ? s.estimateSecondary : undefined}>{estimate}</span>
                                      {open && <span className={s.postingQuiet}>{open}</span>}
                                      {confidence && (
                                        <span className={confidence.level === "low" ? s.confidenceLowList : confidence.level === "medium" ? s.confidenceMediumList : s.confidenceHighList}>
                                          {confidence.level === "high" ? "High confidence" : confidence.level === "medium" ? "Medium confidence" : "Low confidence"}
                                        </span>
                                      )}
                                      {method && <span className={s.methodShort}>{method}</span>}
                                    </span>
                                  );
                                })()}
                                <ChevronRight size={18} aria-hidden="true" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {shown.length < group.beaches.length && (
                        <button type="button" className={s.showMore} onClick={() => setExpanded((current) => ({ ...current, [group.county]: true }))}>
                          Show all {group.beaches.length} in {group.county}
                        </button>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
            {view === "map" && alertSignup}
            {view === "map" && (
              <div className={s.beachRequest}>
                <p>Don’t see your beach?</p>
                <Link href="/california/request-beach">Request your beach <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            )}
            {beaches.some((beach) => beach.neptuneDisplay) && (
              <div className={s.indexLegend}>
                <h3>Neptune Index</h3>
                <NeptuneIndexLegend scale={indexScale} compact />
                <p className={s.legendNote}>The band is the label on the pin. The number is the score.{indexScale?.higherIsBetter === false ? "" : " A higher number is cleaner."} Each tier uses the bands in its own table, so the same number can be a different band. A rules score with no band stays uncolored. A grey band includes a written note when the lab test is old or the estimate used a fallback. Beaches without a published index stay on {statusReading("Normal").title}, {statusReading("Slightly elevated").title}, and {statusReading("Not recommended").title}.</p>
              </div>
            )}
            {beaches.some((beach) => beach.hasEstimate && !beach.neptuneDisplay) && (
              <div className={s.legend} aria-label="Status key">{(["Normal", "Slightly elevated", "Not recommended"] as const).map((status) => <span key={status} className={bandClass(status)}><i className={s.dot} />{statusReading(status).pill}</span>)}</div>
            )}
            <p className={s.legendNote}>
              {beaches.some((beach) => beach.neptuneDisplay)
                ? `A Neptune Index is a 0–${indexScale?.scaleMax ?? 100} score from the model file.${indexScale?.higherIsBetter === false ? "" : " A higher number is cleaner."} `
                : `${statusReading("Normal").pill}, ${statusReading("Slightly elevated").pill}, and ${statusReading("Not recommended").pill} compare today’s estimate with the 104 MPN/100 mL enterococcus standard. ${statusReading("Not recommended").title} is a precaution, not a measured lab result. On the map, the same three readings are labeled Low, Moderate, and High. `}
              <NeptuneIndexExplainerLink />. Pins group together until you zoom in.
            </p>
            {beaches.some((beach) => officialPosting(copyReading(beach))) && (
              <p className={s.legendNote}>A dark pin is an official county posting. It is shown ahead of our estimate, and the beach page still includes that estimate.</p>
            )}
            <p className={s.caveat}>{run.source === "v2" ? "Beach list from the statewide roster." : "Beach list from the published station files."} Estimates, not current lab results. Always follow official beach advisories.</p>
          </section>
        )}
        {view !== "map" && alertSignup}
        {!entitled && <SandboxProOffer checkoutReady={checkoutReady} alertsEnabled={alertsEnabled} ctaLocation={"california_bottom" as CtaLocation} pageContext={view} />}
        {entitled && alertsEnabled && view !== "news" && (
          <SandboxYourNeptune location="california" beaches={beaches.map((beach) => ({ id: beach.id, code: beach.code, name: beach.name }))} />
        )}
      </div>
      <div className={s.faq}>{faq}</div>
      <footer className={s.footer}><Waves size={20} /><p>Know the water. Enjoy the coast.</p><small>Forecasts are estimates based on environmental data. For official beach advisories, consult <a href={advisory.href} target="_blank" rel="noopener noreferrer">{advisory.label}</a>.</small><SandboxSupportLinks /></footer>
    </main>
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function groupByCounty(beaches: BeachListItem[]): { county: string; beaches: BeachListItem[] }[] {
  const groups = new Map<string, BeachListItem[]>();
  for (const beach of beaches) {
    const county = beach.county ?? "County not listed";
    const list = groups.get(county);
    if (list) list.push(beach);
    else groups.set(county, [beach]);
  }
  return [...groups.entries()]
    .map(([county, items]) => ({ county, beaches: items }))
    .sort((a, b) => (b.beaches[0]?.latitude ?? 0) - (a.beaches[0]?.latitude ?? 0) || a.county.localeCompare(b.county));
}
