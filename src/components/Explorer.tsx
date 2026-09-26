"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import PulseMap from "./PulseMap";
import CompositionView from "./CompositionView";
import TribesResearchPage from "./TribesResearch";
import SdpResultsPage from "./SdpResults";
import DevelopmentPage from "./DevelopmentPage";
import { partyColor, tribeColors, winningParties } from "@/lib/pulse-colors";
import type { Candidate, MapLayer, Ward, WardHistory, WardProfile, YearData } from "@/lib/pulse-types";
import type { CompositionData, SdpResult, SdpResultsData, TribeResearch } from "@/lib/pulse-insight-types";

type PackageManifest = {
  package_id: string; assembled_on: string; candidate_records: number; contests: number; wards: number;
  release_limits: string[]; publication_allowed: boolean; demo?: boolean;
  attribution?: string[]; source_links?: { label: string; url: string }[];
  forecast?: { status: string }; pulse?: { latest: string; history: string };
  composition?: { file: string }; sdp_results?: { file: string }; tribes_research?: { file: string };
};
type Backtest = { status: string; model: string; exclusions: string; evaluated_wards: number; warning: string; by_year: Record<string, { single_seat_wards: number; mean_new_party_vote_share?: number; models: Record<string, { mean_total_variation: number; winner_accuracy: number }> }> };
type Page = "overview" | "explorer" | "tribesResearch" | "sdpResults" | "forecast" | "sources" | "development";
type View = "map" | "table" | "composition";
type DetailTab = "results" | "census" | "tribes" | "history";

const years = ["latest", "2026", "2025", "2024", "2023", "2022", "2021"];
const pageIds: Page[] = ["overview", "explorer", "sdpResults", "tribesResearch", "forecast", "sources", "development"];
const number = new Intl.NumberFormat("en-GB");
const pct = (value: number | null | undefined) => value == null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;
const dateText = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));

async function api<T>(path: string): Promise<T> {
  try {
    const response = await fetch(path, { cache: "no-store", credentials: "same-origin", redirect: "manual" });
    if (response.type === "opaqueredirect") throw new Error("Your sign-in has expired. Reload Switchboard to sign in again.");
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("The data request reached a sign-in page. Reload Switchboard to sign in again.");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload as T;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Connection or sign-in expired. Reload Switchboard to retry.");
    throw error;
  }
}

function Swatch({ color }: { color: string }) {
  return <span className="party-swatch" style={{ background: color }} aria-hidden="true" />;
}

function MetricGroup({ name, profile }: { name: string; profile: WardProfile }) {
  const metrics = profile.metrics.filter(metric => metric.group === name);
  if (!metrics.length) return null;
  return <section className="metric-group"><h4>{name}</h4>{metrics.map(metric => <div className="metric-row" key={metric.key}>
    <span>{metric.label}</span><strong>{pct(metric.share)}</strong><small>{number.format(metric.count)} of {number.format(metric.denominator)}</small>
  </div>)}</section>;
}

export default function Explorer() {
  const [page, setPage] = useState<Page>("explorer");
  const [view, setView] = useState<View>("map");
  const [year, setYear] = useState("latest");
  const [ward, setWard] = useState("");
  const [layer, setLayer] = useState<MapLayer>("turnout");
  const [winningParty, setWinningParty] = useState("");
  const [sdpContestedOnly, setSdpContestedOnly] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("results");
  const [manifest, setManifest] = useState<PackageManifest | null>(null);
  const [wards, setWards] = useState<Ward[]>([]);
  const [geometry, setGeometry] = useState<FeatureCollection<Geometry> | null>(null);
  const [profiles, setProfiles] = useState<WardProfile[]>([]);
  const [history, setHistory] = useState<WardHistory>({});
  const [dataState, setDataState] = useState<{ year: string; data: YearData } | null>(null);
  const [backtest, setBacktest] = useState<Backtest | null>(null);
  const [composition, setComposition] = useState<CompositionData | null>(null);
  const [tribesResearch, setTribesResearch] = useState<TribeResearch | null>(null);
  const [sdpResults, setSdpResults] = useState<SdpResultsData | null>(null);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulseError, setPulseError] = useState<string | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const data = dataState?.year === year ? dataState.data : null;
  const isDemo = manifest?.demo === true;
  const profile = profiles.find(item => item.ward_code === ward);
  const historyRows = history[ward] ?? [];
  const selectedName = wards.find(item => item.ward_code === ward)?.ward_name ?? "Select a ward";
  const sortedWards = useMemo(() => [...wards].sort((a, b) => a.ward_name.localeCompare(b.ward_name, "en-GB")), [wards]);
  const contest = data?.contests.find(item => item.ward_code === ward);
  const election = data?.events.find(item => item.event_id === contest?.event_id);
  const parties = (data?.parties.filter(item => item.contest_id === contest?.contest_id) ?? []).sort((a, b) => b.share_of_candidate_votes - a.share_of_candidate_votes);
  const candidates = (data?.candidates.filter(item => item.contest_id === contest?.contest_id) ?? []).sort((a, b) => b.votes - a.votes);
  const winners = data && contest ? winningParties(contest, data) : [];
  const winnerOptions = useMemo(() => [...new Set(data?.parties.filter(item => item.seats_won > 0).map(item => item.party_label) ?? [])].sort(), [data]);
  const visibleWards = wards.filter(item => {
    const wardContest = data?.contests.find(contest => contest.ward_code === item.ward_code);
    if (sdpContestedOnly && !wardContest?.party_labels_contested.includes("SDP")) return false;
    if (data && winningParty && layer === "winners" && !winningParties(wardContest, data).includes(winningParty)) return false;
    return true;
  });
  const upcoming = Object.entries(history).flatMap(([code, rows]) => rows.filter(row => row.status === "upcoming").map(row => ({ ward_code: code, ...row })));

  const selectWard = useCallback((code: string) => {
    setWard(code);
  }, []);

  const navigate = useCallback((next: Page) => {
    setPage(next);
    if (window.location.hash !== `#${next}`) window.history.pushState(null, "", `#${next}`);
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const requested = window.location.hash.slice(1) as Page;
      setPage(pageIds.includes(requested) ? requested : "explorer");
    };
    syncFromUrl();
    window.addEventListener("hashchange", syncFromUrl);
    window.addEventListener("popstate", syncFromUrl);
    return () => { window.removeEventListener("hashchange", syncFromUrl); window.removeEventListener("popstate", syncFromUrl); };
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all([api<PackageManifest>("/api/package/manifest"), api<Ward[]>("/api/package/wards"), api<FeatureCollection<Geometry>>("/api/package/geo")])
      .then(([loadedManifest, loadedWards, loadedGeometry]) => {
        if (!live) return;
        setManifest(loadedManifest); setWards(loadedWards); setGeometry(loadedGeometry);
        if (loadedWards.length) setWard(loadedWards[0].ward_code);
        if (loadedManifest.pulse) {
          Promise.all([api<WardProfile[]>("/api/package/pulse"), api<WardHistory>("/api/package/history")])
            .then(([loadedProfiles, loadedHistory]) => { if (live) { setProfiles(loadedProfiles); setHistory(loadedHistory); } })
            .catch(cause => { if (live) setPulseError(cause.message); });
        }
        if (loadedManifest.composition && loadedManifest.sdp_results && loadedManifest.tribes_research) {
          Promise.all([api<CompositionData>("/api/package/composition"), api<SdpResultsData>("/api/package/sdp-results"), api<TribeResearch>("/api/package/tribes-research")])
            .then(([loadedComposition, loadedSdp, loadedResearch]) => { if (live) { setComposition(loadedComposition); setSdpResults(loadedSdp); setTribesResearch(loadedResearch); } })
            .catch(cause => { if (live) setInsightError(cause.message); });
        }
      }).catch(cause => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    api<YearData>(`/api/package/year/${year}`).then(result => {
      if (live) { setDataState({ year, data: result }); setError(null); }
    }).catch(cause => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [year]);
  useEffect(() => {
    if (manifest?.forecast?.status !== "retrospective_backtest_only") return;
    let live = true;
    api<Backtest>("/api/package/forecast").then(result => { if (live) setBacktest(result); }).catch(cause => { if (live) setForecastError(cause.message); });
    return () => { live = false; };
  }, [manifest]);

  return <>
    <header className="top"><div><div className="brand">switch<em>board</em></div><div className="strap">Electoral information</div></div><div className="account">{isDemo ? "Owner preview · synthetic data" : "Leeds pilot · published results"}</div></header>
    {isDemo && <div className="notice" role="status"><strong>Fictional preview data.</strong> Every ward shape, result and turnout figure is invented for testing the website.</div>}
    {!isDemo && manifest && <div className="notice" role="status"><strong>Leeds Pulse pilot.</strong> Recorded results, dated council composition, 2021 Census and exploratory neighbourhood groups. Source gaps are flagged; the latest ward result is not a current-seat record or a future forecast.</div>}
    <div className="shell"><nav className="side" aria-label="Main navigation">
      {([["overview", "Overview"], ["explorer", "Explorer"], ["sdpResults", "SDP Results"], ["tribesResearch", "Electoral Tribes"], ["forecast", "Forecast research"], ["sources", "Data & sources"], ["development", "Development"]] as const).map(([id, label]) =>
        <a key={id} href={`#${id}`} className={page === id ? "active" : ""} aria-current={page === id ? "page" : undefined} onClick={event => { event.preventDefault(); navigate(id); }}>{label}</a>)}
      <div className="side-note">{isDemo ? "SYNTHETIC PREVIEW" : "LEEDS PILOT"}<br />Viewer workspace<br /><br />Reports and administration are still in development.</div>
    </nav><main className="content">
      {page === "overview" && <>
        <div className="eyebrow">{isDemo ? "Owner preview" : "Leeds Pulse pilot"}</div><h1>Your electoral workspace</h1>
        <p className="muted">{isDemo ? "Explore the interface using invented records." : "Explore recorded Leeds elections alongside ward-level Census and neighbourhood context."}</p>
        <div className="stats">
          <div className="card stat">Wards<strong>{manifest?.wards ?? "—"}</strong><span className="muted">Leeds local council</span></div>
          <div className="card stat">Imported contests<strong>{manifest?.contests ?? "—"}</strong><span className="muted">2021–2026 result package</span></div>
          <div className="card stat">2021 Census residents<strong>{profiles.length ? number.format(profiles.reduce((total, item) => total + item.population, 0)) : "—"}</strong><span className="muted">Best-fit to 2025 wards</span></div>
        </div>
        <div className="stack"><div className="card"><h2>Explore the wards</h2><p>View turnout or winning parties on the map, compare candidate results, and inspect Census and Electoral Tribes context.</p><button className="button" onClick={() => navigate("explorer")}>Open Explorer</button></div>
          {!isDemo && upcoming.map(item => <div className="card" key={`${item.ward_code}-${item.date}`}><h2>Announced by-election</h2><p>{wards.find(ward => ward.ward_code === item.ward_code)?.ward_name} · {dateText(item.date)}. No result has been imported.</p><button className="link-button" onClick={() => { selectWard(item.ward_code); setDetailTab("history"); navigate("explorer"); }}>See ward history</button></div>)}
          <div className="card"><h2>Data status</h2><p>{isDemo ? "This workspace uses fictional records." : "The Farnley & Wortley 2024 by-election declaration is blank, and four scheduled ward results have documented source disagreements. These appear as explicit notes in the Explorer."}</p><button className="link-button" onClick={() => navigate("sources")}>View sources and limits</button></div>
          <div className="card"><h2>Development &amp; releases</h2><p>See the Leeds pilot plan, what is being checked next, and a dated history of published changes.</p><button className="link-button" onClick={() => navigate("development")}>View development plan</button></div></div>
      </>}

      {page === "explorer" && <>
        <div className="heading"><div><div className="eyebrow">{isDemo ? "Synthetic sample" : "England / Leeds / Local council"}</div><h1>Explore Leeds</h1><p>Results, Census and neighbourhood context in one place.</p></div><span className="badge">Pulse · {isDemo ? "Fictional sample" : "Recorded information"}</span></div>
        <div className="toolbar">
          {view !== "composition" && <label className="field search">Find a ward<select value={ward} onChange={event => selectWard(event.target.value)}><option value="">Select a ward</option>{sortedWards.map(item => <option key={item.ward_code} value={item.ward_code}>{item.ward_name}</option>)}</select></label>}
          <label className="field">Election view<select value={year} onChange={event => { setError(null); setWinningParty(""); setYear(event.target.value); }}><option value="latest">Latest recorded</option>{years.slice(1).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          {view !== "composition" && <label className="field">Map colour<select value={layer} onChange={event => { setLayer(event.target.value as MapLayer); setWinningParty(""); }}><option value="turnout">Turnout</option><option value="winners">Winning party</option>{profiles.length > 0 && <option value="tribes">Electoral Tribes</option>}</select></label>}
          {view !== "composition" && layer === "winners" && <label className="field">Show winners<select value={winningParty} onChange={event => setWinningParty(event.target.value)}><option value="">All parties</option>{winnerOptions.map(party => <option key={party} value={party}>{party}</option>)}</select></label>}
          {view !== "composition" && <label className="contested-filter"><input type="checkbox" checked={sdpContestedOnly} onChange={event => setSdpContestedOnly(event.target.checked)} />SDP contested only</label>}
          <div className="switch" aria-label="Explorer view"><button className={view === "map" ? "active" : ""} aria-pressed={view === "map"} onClick={() => setView("map")}>Map</button><button className={view === "table" ? "active" : ""} aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button><button className={view === "composition" ? "active" : ""} aria-pressed={view === "composition"} onClick={() => setView("composition")}>Composition</button></div>
        </div>
        {error && <div className="notice error" role="alert">Unable to load results: {error} <button className="link-button retry-link" onClick={() => window.location.reload()}>Reload and sign in</button></div>}
        {pulseError && <div className="notice error" role="alert">Ward Census and Tribes context is unavailable: {pulseError}</div>}
        {insightError && <div className="notice error" role="alert">Composition and research views are unavailable: {insightError} <button className="link-button retry-link" onClick={() => window.location.reload()}>Reload and sign in</button></div>}
        {!data && !error && <p role="status">Loading {year === "latest" ? "latest" : year} results…</p>}
        {view === "composition" ? (composition ? <CompositionView data={composition} year={year} /> : !insightError && <p role="status">Loading council composition…</p>) : data && geometry && (view === "map" ? <div className="work">
          <div className="map-pane"><div className="map-heading"><strong>{layer === "turnout" ? "Turnout by ward" : layer === "winners" ? "Elected party by ward" : "Dominant neighbourhood group"}</strong><span>2025 boundaries</span></div>
            <PulseMap wards={wards} geometry={geometry} data={data} profiles={profiles} layer={layer} winningParty={winningParty} sdpContestedOnly={sdpContestedOnly} selected={ward} onSelect={selectWard} />
            <div className="legend" aria-label="Map legend">{layer === "turnout" ? <><span>Lower turnout</span><span className="gradient" aria-hidden="true" /><span>Higher turnout</span><span>Grey: no result</span></> : layer === "winners" ? <>{winnerOptions.map(party => <span className="legend-item" key={party}><Swatch color={partyColor(party)} />{party}</span>)}<span className="legend-item"><span className="party-swatch mixed-swatch" />Split seats</span><span>Grey: no result</span></> : <>{profiles[0]?.tribes.map(tribe => <span className="legend-item" key={tribe.id}><Swatch color={tribeColors[tribe.id]} />{tribe.name}</span>)}</> }</div>
            {layer === "winners" && <p className="map-note">A ward with two seats won by different parties is striped. The party filter includes every party that won a seat there.</p>}
          </div>
          <aside className="detail" aria-live="polite"><div className="kicker">Ward / {isDemo ? "fictional sample" : "Leeds"}</div><h2>{selectedName}</h2>
            <div className="detail-tabs" role="group" aria-label="Ward information">{([["results", "Results"], ["census", "Census"], ["tribes", "Tribes"], ["history", "History"]] as const).map(([id, label]) => <button key={id} className={detailTab === id ? "active" : ""} aria-pressed={detailTab === id} onClick={() => setDetailTab(id)}>{label}</button>)}</div>
            {detailTab === "results" && <><p className="sub">{contest && election ? `${dateText(election.election_date)} · ${election.event_kind === "by_election" ? "By-election" : "Council election"}` : "No imported result in this view"}</p>
              {contest ? <><div className="meta"><div><span>Turnout</span><strong>{pct(contest.turnout_rate)}</strong></div><div><span>Seats elected</span><strong>{contest.seats_available}</strong></div></div>
                <p className="winner-line"><strong>Elected:</strong> {winners.length ? winners.join(" and ") : "Unavailable"}</p>
                <h3>Party vote shares</h3>{parties.map(party => <div className="result" key={party.party_label}><div className="result-label"><span><Swatch color={partyColor(party.party_label)} />{party.party_label}{party.seats_won > 0 ? " ✓" : ""}</span><span>{pct(party.share_of_candidate_votes)}</span></div><div className="track"><div className="fill" style={{ width: `${party.share_of_candidate_votes * 100}%`, background: partyColor(party.party_label) }} /></div></div>)}
                <p className="footnote">Shares are candidate votes divided by all candidate votes{contest.seats_available > 1 ? "; multiple seats were contested, so this is not a share of voters." : "."}</p>
                <details className="candidate-details"><summary>Candidate votes ({candidates.length})</summary><ul>{candidates.map((candidate: Candidate) => <li key={candidate.candidate_name + candidate.party_label}><span>{candidate.candidate_name}{candidate.elected ? " · elected" : ""}<small>{candidate.party_label}</small></span><strong>{number.format(candidate.votes)}</strong></li>)}</ul></details>
                {contest.data_quality_note && <p className="notice small-notice">{contest.data_quality_note}</p>}
              </> : <p className="sub">{year === "2025" ? "Leeds had no scheduled council election in 2025; only Morley South has an imported by-election result." : "No result is available for this ward in the selected view."}</p>}
              {historyRows.some(item => item.status === "source_rejected") && <p className="notice small-notice">A ward by-election has a rejected source. See History for the exact gap.</p>}
              <div className="forecast"><h3>Forecast</h3><p className="sub">No published forecast</p></div>
            </>}
            {detailTab === "census" && (profile ? <><p className="sub">2021 Census · allocated to 2025 ward boundaries</p><div className="census-total"><span>Usual residents in allocated output areas</span><strong>{number.format(profile.population)}</strong></div><p className="footnote">Built from {number.format(profile.oa_count)} output areas. Census disclosure control and best-fit geography can create small differences from native council totals.</p>{["Age", "Households and housing", "Work and education", "Population"].map(group => <MetricGroup key={group} name={group} profile={profile} />)}</> : <p className="sub">{isDemo ? "No Census data in the fictional preview." : "Loading Census profile…"}</p>)}
            {detailTab === "tribes" && (profile ? <><p className="sub">Exploratory K=7 grouping of 2021 Census output areas. This describes neighbourhood characteristics, not individuals or voting intentions.</p><p><strong>Largest group:</strong> {profile.tribes.find(tribe => tribe.id === profile.dominant_tribe_id)?.name}</p>{profile.tribes.map(tribe => <div className="result" key={tribe.id}><div className="result-label"><span><Swatch color={tribeColors[tribe.id]} />{tribe.name}</span><span>{pct(tribe.share)}</span></div><div className="track"><div className="fill" style={{ width: `${tribe.share * 100}%`, background: tribeColors[tribe.id] }} /></div></div>)}<p className="footnote">Shares are weighted by 2021 Census residents in each output area. Group names are the project&apos;s interpretation of a statistical model.</p></> : <p className="sub">{isDemo ? "No Electoral Tribes data in the fictional preview." : "Loading neighbourhood profile…"}</p>)}
            {detailTab === "history" && (historyRows.length ? <ol className="history-list">{historyRows.map((item, index) => <li key={`${item.date}-${index}`}><strong>{dateText(item.date)}</strong><span>{item.event_kind === "by_election" ? "By-election" : "Council election"} · {item.status === "included" ? "Recorded" : item.status === "upcoming" ? "Announced, no result yet" : "Result source rejected"}</span>{item.winners?.length ? <small>Elected: {item.winners.map(winner => `${winner.candidate_name} (${winner.party_label})`).join("; ")}</small> : null}{item.reason && <small>{item.reason}</small>}{item.data_quality_note && <small>{item.data_quality_note}</small>}{item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer">Source notice</a>}</li>)}</ol> : <p className="sub">{isDemo ? "No historical timeline in the fictional preview." : "Loading ward history…"}</p>)}
          </aside>
        </div> : <div className="table-wrap"><table className="results-table"><thead><tr><th>Ward</th><th>Poll date</th><th>Elected party</th><th>Seats</th><th>Turnout</th><th>2021 residents</th></tr></thead><tbody>{visibleWards.map(item => { const row = data.contests.find(contest => contest.ward_code === item.ward_code); const event = data.events.find(event => event.event_id === row?.event_id); const elected = winningParties(row, data); const context = profiles.find(profile => profile.ward_code === item.ward_code); return <tr key={item.ward_code}><td><button className="link-button" onClick={() => { selectWard(item.ward_code); setView("map"); setDetailTab("results"); }}>{item.ward_name}</button></td><td>{event ? dateText(event.election_date) : "No imported poll"}</td><td>{elected.map(party => <span className="winner-chip" key={party}><Swatch color={partyColor(party)} />{party}</span>)}</td><td>{row?.seats_available ?? "—"}</td><td>{pct(row?.turnout_rate)}</td><td>{context ? number.format(context.population) : "—"}</td></tr>; })}</tbody></table></div>)}
        <div className="under"><span>{view === "composition" ? "Council-published, dated composition snapshots" : <>{year === "latest" ? "Latest recorded" : year} · {data?.contests.length ?? 0} ward poll(s) in this view{winningParty && layer === "winners" ? ` · ${visibleWards.length} with ${winningParty} winning` : ""}{sdpContestedOnly ? ` · ${visibleWards.length} matching SDP contested filter` : ""}</>}</span><button className="link-button" onClick={() => navigate("sources")}>Coverage & sources</button></div>
      </>}

      {page === "sdpResults" && (sdpResults ? <SdpResultsPage data={sdpResults} onOpenWard={(row: SdpResult) => { setYear(String(row.year)); selectWard(row.ward_code); setView("map"); setDetailTab("results"); navigate("explorer"); }} /> : <div role="status">{isDemo ? "SDP results are unavailable in the fictional preview." : insightError ? `Unable to load SDP results: ${insightError}` : "Loading SDP results…"}</div>)}

      {page === "tribesResearch" && (tribesResearch ? <TribesResearchPage research={tribesResearch} onExplore={() => { setLayer("tribes"); setView("map"); navigate("explorer"); }} /> : <div role="status">{isDemo ? "Electoral Tribes research is unavailable in the fictional preview." : insightError ? `Unable to load Electoral Tribes research: ${insightError}` : "Loading Electoral Tribes research…"}</div>)}

      {page === "forecast" && <><div className="eyebrow">Forecast / retrospective research</div><h1>Historical model tests</h1><p className="muted">Simple benchmarks tested against past elections. No future election forecast has been validated.</p><div className="card"><h2>Latest prior ward result</h2>{isDemo ? <p>The fictional preview has no model tests.</p> : forecastError ? <p role="alert">Unable to load historical tests: {forecastError}</p> : !backtest ? <p role="status">Loading historical tests…</p> : <><p>{backtest.evaluated_wards} single-seat ward polls tested.</p><div className="table-wrap"><table className="results-table"><thead><tr><th>Election</th><th>Wards</th><th>Average share error</th><th>Winner correct</th></tr></thead><tbody>{Object.entries(backtest.by_year).map(([testYear, result]) => <tr key={testYear}><td>{testYear}</td><td>{result.single_seat_wards}</td><td>{pct(result.models.last_ward.mean_total_variation)}</td><td>{pct(result.models.last_ward.winner_accuracy)}</td></tr>)}</tbody></table></div><p className="notice">{backtest.warning}</p><p className="footnote">{backtest.exclusions}</p></>}</div></>}

      {page === "sources" && <><div className="eyebrow">Publication details</div><h1>Data & sources</h1><p className="muted">Definitions, dates and gaps behind the Explorer.</p><div className="card"><h2>{isDemo ? "Synthetic owner preview" : "Leeds · local council"}</h2><p>{manifest ? `${number.format(manifest.candidate_records)} candidate records · ${manifest.contests} contests · ${manifest.wards} wards` : "Package unavailable"}</p><p>{isDemo ? "Every record and shape is invented." : "Election results are shown on 2025 ward boundaries. Census data are 2021 output-area aggregates assigned to those wards using the official best-fit lookup; they are not current population estimates. Electoral Tribes are an exploratory seven-group classification, not measured political support."}</p><h3>Coverage limits</h3><ul>{manifest?.release_limits.map((limit, index) => <li key={index}>{limit}</li>)}</ul>{!isDemo && manifest?.source_links && <><h3>Source documents</h3><ul>{manifest.source_links.map(source => <li key={`${source.label}-${source.url}`}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}</ul></>}{!isDemo && manifest?.attribution && <><h3>Attribution</h3><ul>{manifest.attribution.map(credit => <li key={credit}>{credit}</li>)}</ul></>}<p className="footnote">{isDemo ? "Fictional preview." : `Release: ${manifest?.package_id ?? "unavailable"}. No party-supplied data or individual voter records.`}</p></div></>}
      {page === "development" && <DevelopmentPage currentPackage={isDemo ? "Fictional preview" : manifest?.package_id} onExplore={() => navigate("explorer")} onSources={() => navigate("sources")} />}
    </main></div>
  </>;
}
