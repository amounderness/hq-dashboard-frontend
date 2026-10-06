"use client";

import { useEffect, useMemo, useState } from "react";
import type { SdpResultsData } from "@/lib/pulse-insight-types";
import type { Ward, WardHistory, WardProfile } from "@/lib/pulse-types";

type OverviewManifest = {
  package_id: string;
  assembled_on: string;
  wards: number;
  contests: number;
  history_source_decisions_resolved?: boolean;
};

type OverviewPageProps = {
  isDemo: boolean;
  manifest: OverviewManifest | null;
  profiles: WardProfile[];
  sdpResults: SdpResultsData | null;
  wards: Ward[];
  history: WardHistory;
  onNavigate: (page: "explorer" | "sdpResults" | "tribesResearch" | "forecast" | "reports" | "sources" | "development") => void;
  onOpenWardHistory: (wardCode: string) => void;
};

const number = new Intl.NumberFormat("en-GB");
const leedsElectionSource = "https://www.leeds.gov.uk/elections/leeds-city-council-elections";
const nationalElectionSource = "https://www.electoralcommission.org.uk/about-us/our-plans-priorities-and-spending/corporate-plan-2025/6-2029/30/electoral-system";
const parliamentSource = "https://commonslibrary.parliament.uk/research-briefings/sn04512/";

function currentLocalDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function daysUntil(from: string | null, to: string): number | null {
  if (!from) return null;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function Countdown({ today, target, broad = false, pastLabel = "Date passed" }: { today: string | null; target: string; broad?: boolean; pastLabel?: string }) {
  const days = daysUntil(today, target);
  if (days === null) return <span className="overview-count">Calculating…</span>;
  return <span className="overview-count">{days < 0 ? pastLabel : broad ? days === 0 ? "May begins today" : `${number.format(days)} days until May begins` : days === 0 ? "Today" : `${number.format(days)} days to go`}</span>;
}

export default function OverviewPage({ isDemo, manifest, profiles, sdpResults, wards, history, onNavigate, onOpenWardHistory }: OverviewPageProps) {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => setToday(currentLocalDay());
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const sdpTotals = useMemo(() => sdpResults?.rows.reduce((total, row) => ({
    votes: total.votes + row.sdp_votes,
    candidacies: total.candidacies + row.sdp_candidates.length,
    wins: total.wins + row.sdp_seats_won,
  }), { votes: 0, candidacies: 0, wins: 0 }), [sdpResults]);
  const upcoming = Object.entries(history).flatMap(([wardCode, rows]) => rows
    .filter(row => row.status === "upcoming")
    .map(row => ({ wardCode, date: row.date, wardName: wards.find(ward => ward.ward_code === wardCode)?.ward_name ?? "Ward by-election" })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const residents = profiles.length ? profiles.reduce((total, item) => total + item.population, 0) : null;

  return <div className="overview-page">
    <div className="eyebrow">{isDemo ? "Owner preview" : "England-wide electoral workspace"}</div>
    <h1>Your electoral workspace</h1>
    <p className="overview-lead">Switchboard brings recorded election results, local context and research into one private workspace for SDP officers and campaigners. Use it to see what happened, check the evidence behind each figure, and prepare for the next electoral cycle.</p>
    <p className="muted overview-qualifier">{isDemo ? "This owner preview uses invented records to demonstrate the interface." : "Detailed released information currently covers Leeds City Council: recorded results, 2021 Census context and exploratory Electoral Tribes. We are testing selected areas across England before further release. Forecast is historical research, not a live projection."}</p>

    <section aria-labelledby="overview-numbers">
      <div className="overview-section-head"><h2 id="overview-numbers">Leeds at a glance</h2><span>Approved package · {manifest?.package_id ?? "loading"}</span></div>
      <div className="stats overview-stats">
        <div className="card stat">Wards<strong>{manifest?.wards ?? "—"}</strong><span className="muted">Leeds City Council</span></div>
        <div className="card stat">Imported contests<strong>{manifest?.contests ?? "—"}</strong><span className="muted">Recorded result events</span></div>
        <div className="card stat">2021 Census residents<strong>{residents === null ? "—" : number.format(residents)}</strong><span className="muted">Best-fit to 2025 ward boundaries</span></div>
        <div className="card stat">SDP candidate votes<strong>{sdpTotals ? number.format(sdpTotals.votes) : "—"}</strong><span className="muted">Total across recorded polls</span></div>
        <div className="card stat">SDP candidacies<strong>{sdpTotals ? number.format(sdpTotals.candidacies) : "—"}</strong><span className="muted">Candidate entries, not unique people</span></div>
        <div className="card stat">SDP wins<strong>{sdpTotals ? number.format(sdpTotals.wins) : "—"}</strong><span className="muted">Seats won in recorded polls</span></div>
      </div>
      <p className="footnote">SDP totals cover the imported 2021–2026 results where the party stood. Votes are summed across separate polls; wins are historical election outcomes, not the number of current SDP councillors. Missing data is not counted as zero.</p>
    </section>

    <div className="overview-columns">
      <section className="card overview-timeline" aria-labelledby="overview-dates">
        <div className="overview-section-head"><h2 id="overview-dates">Election timeline</h2><span>Plan, check, prepare</span></div>
        <ol className="overview-event-list">
          {!isDemo && upcoming.map(item => <li key={`${item.wardCode}-${item.date}`} className="overview-event"><div className="overview-event-date"><time dateTime={item.date}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${item.date}T12:00:00Z`))}</time></div><div><h3>{item.wardName} by-election</h3><p>Announced poll · result not yet imported</p><button className="link-button" onClick={() => onOpenWardHistory(item.wardCode)}>See ward history</button></div><Countdown today={today} target={item.date} pastLabel="Result awaiting import" /></li>)}
          <li className="overview-event"><div className="overview-event-date"><time dateTime="2027-05-06">6 May 2027</time></div><div><h3>Leeds City Council elections</h3><p>Next scheduled Leeds council poll · <a href={leedsElectionSource} target="_blank" rel="noreferrer">Leeds City Council</a></p></div><Countdown today={today} target="2027-05-06" /></li>
          <li className="overview-event"><div className="overview-event-date"><time dateTime="2028-05">May 2028</time></div><div><h3>English local elections</h3><p>Leeds normally votes by thirds; its 2028 poll date should be confirmed when published. <a href={nationalElectionSource} target="_blank" rel="noreferrer">Electoral Commission calendar</a></p></div><Countdown today={today} target="2028-05-01" broad /></li>
          <li className="overview-event"><div className="overview-event-date"><time dateTime="2029-05">May 2029</time></div><div><h3>English local elections elsewhere</h3><p><strong>Leeds fallow year:</strong> no scheduled Leeds City Council election. <a href={leedsElectionSource} target="_blank" rel="noreferrer">Leeds election cycle</a></p></div><Countdown today={today} target="2029-05-01" broad /></li>
          <li className="overview-event"><div className="overview-event-date"><time dateTime="2029-08-15">By 15 Aug 2029</time></div><div><h3>Next UK general election</h3><p>Latest possible polling date, <strong>not an announced election day</strong>; it may happen earlier. <a href={parliamentSource} target="_blank" rel="noreferrer">House of Commons Library</a></p></div><span className="overview-count">{today === null ? "Calculating…" : daysUntil(today, "2029-08-15")! < 0 ? "Check latest election date" : `${number.format(daysUntil(today, "2029-08-15")!)} days to latest date`}</span></li>
        </ol>
        <p className="footnote">Month-only entries count down to the start of May as planning markers, not to a confirmed polling day. Dates and scope may change; follow the linked election authorities.</p>
      </section>
      <section className="overview-actions" aria-labelledby="overview-use">
        <div className="overview-section-head"><h2 id="overview-use">What you can do</h2></div>
        <div className="card"><h3>Explore Pulse</h3><p>Find a ward, inspect recorded votes and turnout, view council composition, and read Census and Electoral Tribes context.</p><button className="link-button" onClick={() => onNavigate("explorer")}>Open Explorer</button></div>
        <div className="card"><h3>Review SDP results</h3><p>Compare where SDP candidates stood, the votes they received, and the seats won in each recorded poll.</p><button className="link-button" onClick={() => onNavigate("sdpResults")}>Open SDP Results</button></div>
        <div className="card"><h3>Use and check the evidence</h3><p>Download a report, check source limitations, or follow what changed between releases.</p><div className="overview-links"><button className="link-button" onClick={() => onNavigate("reports")}>Reports</button><button className="link-button" onClick={() => onNavigate("sources")}>Data &amp; sources</button><button className="link-button" onClick={() => onNavigate("development")}>Development</button></div></div>
        <div className="card"><h3>Forecast is in development</h3><p>Historical tests explain the research direction. Future vote-share projections will need backtesting and uncertainty checks before they are published as guidance.</p><button className="link-button" onClick={() => onNavigate("forecast")}>Read about Forecast</button></div>
      </section>
    </div>
    <p className="footnote overview-release">{isDemo ? "Fictional owner preview." : `Latest loaded package: ${manifest?.package_id ?? "loading"}${manifest?.assembled_on ? ` · assembled ${manifest.assembled_on}` : ""}.`} {manifest?.history_source_decisions_resolved ? "Historical source choices are documented in Data & sources." : "Check Data & sources for release limits."}</p>
  </div>;
}
