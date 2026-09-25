"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoArea, geoMercator, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";

type Ward = { ward_code: string; ward_name: string };
type Contest = { contest_id: string; event_id: string; ward_code: string; seats_available: number; turnout_rate: number | null; all_candidate_votes: number; party_labels_contested: string[] };
type Candidate = { contest_id: string; party_label: string; candidate_name: string; votes: number; elected: boolean };
type Party = { contest_id: string; party_label: string; share_of_candidate_votes: number; candidate_votes: number; seats_won: number };
type Event = { event_id: string; election_date: string; event_kind: string; status: string; reason?: string };
type YearData = { events: Event[]; contests: Contest[]; candidates: Candidate[]; parties: Party[] };
type PackageManifest = { package_id: string; assembled_on: string; candidate_records: number; contests: number; wards: number; release_limits: string[]; publication_allowed: boolean; demo?: boolean; attribution?: string[]; source_links?: { label: string; url: string }[]; forecast?: { status: string } };
type Backtest = { status: string; model: string; method: string; scope: string; exclusions: string; evaluated_wards: number; warning: string; by_year: Record<string, { single_seat_wards: number; mean_new_party_vote_share?: number; models: Record<string, { mean_total_variation: number; winner_accuracy: number }> }> };
type Page = "overview" | "explorer" | "forecast" | "sources";
type Mode = "map" | "table";

const years = ["2026", "2025", "2024", "2023", "2022", "2021"];
const format = new Intl.NumberFormat("en-GB");
const pct = (value: number | null | undefined) => value == null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;

async function api<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || `Request failed (${response.status})`);
  return json as T;
}

function MapView({ wards, geometry, data, selected, onSelect }: { wards: Ward[]; geometry: FeatureCollection<Geometry>; data: YearData; selected: string; onSelect: (code: string) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 660, height: 490 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setSize({ width: Math.max(node.clientWidth, 250), height: Math.max(node.clientHeight, 300) }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // d3-geo interprets the source GeoJSON's exterior ring orientation as its complement.
  // Reverse ring order for rendering only; retain the packaged geometry unchanged.
  const displayed = useMemo<FeatureCollection<Geometry>>(() => ({
    ...geometry,
    features: geometry.features.map(feature => {
      if (geoArea(feature) <= 2 * Math.PI) return feature;
      const g = feature.geometry;
      if (g.type === "Polygon") return { ...feature, geometry: { ...g, coordinates: g.coordinates.map(ring => [...ring].reverse()) } };
      if (g.type === "MultiPolygon") return { ...feature, geometry: { ...g, coordinates: g.coordinates.map(poly => poly.map(ring => [...ring].reverse())) } };
      return feature;
    }),
  }), [geometry]);
  const projection = useMemo(() => geoMercator().fitExtent([[14, 14], [size.width - 14, size.height - 14]], displayed), [displayed, size]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const contests = useMemo(() => new Map(data.contests.map(c => [c.ward_code, c])), [data]);
  const names = useMemo(() => new Map(wards.map(w => [w.ward_code, w.ward_name])), [wards]);
  const turns = data.contests.map(c => c.turnout_rate).filter((x): x is number => x !== null);
  const lo = turns.length ? Math.min(...turns) : 0;
  const hi = turns.length ? Math.max(...turns) : 1;
  const fill = (value: number | null | undefined) => {
    if (value == null) return "#c5ceda";
    const t = hi === lo ? .5 : (value - lo) / (hi - lo);
    const a = [213, 229, 247], b = [47, 100, 191];
    return `rgb(${a.map((v, i) => Math.round(v + t * (b[i] - v))).join(",")})`;
  };
  return <svg ref={ref} className="ward-map" viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="Wards shaded by turnout; wards can be selected by keyboard or pointer">
    {displayed.features.map(feature => {
      const code = String(feature.id ?? feature.properties?.ward_code);
      const contest = contests.get(code);
      return <path key={code} d={path(feature) ?? ""} fill={fill(contest?.turnout_rate)} stroke={code === selected ? "#14233d" : "#fff"} strokeWidth={code === selected ? 2.5 : .8} tabIndex={0} role="button" aria-label={`${names.get(code) ?? code}, turnout ${pct(contest?.turnout_rate)}`} aria-pressed={code === selected} onClick={() => onSelect(code)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(code); } }}><title>{names.get(code)} · {pct(contest?.turnout_rate)}</title></path>;
    })}
  </svg>;
}

export default function Explorer() {
  const [page, setPage] = useState<Page>("explorer");
  const [mode, setMode] = useState<Mode>("map");
  const [year, setYear] = useState("2026");
  const [ward, setWard] = useState("");
  const [search, setSearch] = useState("");
  const [manifest, setManifest] = useState<PackageManifest | null>(null);
  const [wards, setWards] = useState<Ward[]>([]);
  const [geometry, setGeometry] = useState<FeatureCollection<Geometry> | null>(null);
  const [yearData, setYearData] = useState<{ year: string; data: YearData } | null>(null);
  const [backtest, setBacktest] = useState<Backtest | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = yearData?.year === year ? yearData.data : null;
  const isDemo = manifest?.demo === true;
  const loading = !data && !error;
  const selectWard = useCallback((code: string) => { setWard(code); const name = wards.find(w => w.ward_code === code)?.ward_name; if (name) setSearch(name); }, [wards]);

  useEffect(() => {
    let live = true;
    Promise.all([api<PackageManifest>("/api/package/manifest"), api<Ward[]>("/api/package/wards"), api<FeatureCollection<Geometry>>("/api/package/geo")])
      .then(([m, w, g]) => { if (!live) return; setManifest(m); setWards(w); setGeometry(g); if (w.length) { setWard(w[0].ward_code); setSearch(w[0].ward_name); } })
      .catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    api<YearData>(`/api/package/year/${year}`).then(value => { if (live) { setYearData({ year, data: value }); setError(null); } }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [year]);
  useEffect(() => {
    if (manifest?.forecast?.status !== "retrospective_backtest_only") return;
    let live = true;
    api<Backtest>("/api/package/forecast").then(value => { if (live) setBacktest(value); }).catch(e => { if (live) setForecastError(e.message); });
    return () => { live = false; };
  }, [manifest]);

  const selectedName = wards.find(w => w.ward_code === ward)?.ward_name ?? "Select a ward";
  const contest = data?.contests.find(c => c.ward_code === ward);
  const event = data?.events.find(e => e.event_id === contest?.event_id);
  const parties = (data?.parties.filter(p => p.contest_id === contest?.contest_id) ?? []).sort((a, b) => b.share_of_candidate_votes - a.share_of_candidate_votes);
  const rejected = data?.events.filter(e => e.status === "source_rejected") ?? [];
  const chooseSearch = (value: string) => { setSearch(value); const found = wards.find(w => w.ward_name.toLowerCase() === value.toLowerCase()); if (found) setWard(found.ward_code); };

  return <><header className="top"><div><div className="brand">switch<em>board</em></div><div className="strap">Electoral information</div></div><div className="account">{isDemo ? "Owner preview · synthetic data" : "Leeds pilot · published results"}</div></header>
    {isDemo && <div className="notice" role="status"><strong>Fictional preview data.</strong> Every ward shape, result, turnout figure and party shown here is invented for testing the website. Do not use these figures for electoral or campaign decisions.</div>}
    {!isDemo && manifest && <div className="notice" role="status"><strong>Public results pilot.</strong> Historical results have documented source differences and incomplete by-election coverage. No prospective forecast or current council composition is shown. See Data &amp; sources.</div>}
    <div className="shell"><nav className="side" aria-label="Main navigation">
      {([ ["overview", "Overview"], ["explorer", "Explorer"], ["forecast", "Forecast research"], ["sources", "Data & sources"] ] as const).map(([id, label]) => <a key={id} href={`#${id}`} className={page === id ? "active" : ""} aria-current={page === id ? "page" : undefined} onClick={e => { e.preventDefault(); setPage(id); }}>{label}</a>)}
      <div className="side-note">{isDemo ? "SYNTHETIC PREVIEW" : "LEEDS PILOT"}<br />Viewer workspace<br /><br />Reports and administration follow Explorer.</div>
    </nav><main className="content">
      {page === "overview" && <><div className="eyebrow">{isDemo ? "Owner preview" : "Leeds pilot"}</div><div className="heading"><div><h1>Your electoral workspace</h1><p>{isDemo ? "Explore the interface using invented records." : "Open the imported records and inspect their coverage."}</p></div></div>
        <div className="stats"><div className="card stat">Ward coverage<strong>{manifest?.wards ?? "—"}</strong><span className="muted">{isDemo ? "Fictional sample wards" : "Leeds local council"}</span></div><div className="card stat">{isDemo ? "Sample contests" : "Imported contests"}<strong>{manifest?.contests ?? "—"}</strong><span className="muted">2021–2026 package</span></div><div className="card stat">Latest {isDemo ? "sample" : "imported"} poll<strong>May 2026</strong><span className="muted">Latest within this package</span></div></div>
        <div className="stack"><div className="card"><h2>{isDemo ? "Fictional election records" : "Leeds election records"}</h2><p>{isDemo ? "Sample polls across three invented wards. Dates, candidates and vote figures are not real." : "Scheduled polls in 2021–2024 and 2026, and the Morley South 2025 by-election."}</p><p className="muted">{isDemo ? "Preview" : "Results"} package assembled {manifest?.assembled_on ?? "—"}.</p><button className="button" onClick={() => setPage("explorer")}>Open Explorer</button></div><div className="card"><h2>Forecast research</h2><p className="muted">{isDemo ? "No model test data in the fictional preview." : "Historical model tests are available. No prediction for a future election has been validated."}</p><button className="button" onClick={() => setPage("forecast")}>View historical tests</button></div></div></>}
      {page === "explorer" && <><div className="heading"><div><div className="eyebrow">{isDemo ? "Synthetic sample / invented wards" : "England / Leeds / Local council"}</div><h1>{isDemo ? "Explore the preview" : "Explore Leeds"}</h1><p>{isDemo ? "Try the map and results with fictional records." : "Election records, in context."}</p></div><span className="badge">{isDemo ? "Pulse · Synthetic sample" : "Pulse · Imported results"}</span></div>
        <div className="toolbar"><label className="field search">Find a ward<input list="ward-options" type="search" value={search} onChange={e => chooseSearch(e.target.value)} placeholder={isDemo ? "Search sample wards…" : "Search Leeds wards…"} /><datalist id="ward-options">{wards.map(w => <option key={w.ward_code} value={w.ward_name} />)}</datalist></label><label className="field">Election year<select value={year} onChange={e => { setError(null); setYear(e.target.value); }}>{years.map(y => <option key={y}>{y}</option>)}</select></label><div className="switch" aria-label="Explorer view"><button className={mode === "map" ? "active" : ""} aria-pressed={mode === "map"} onClick={() => setMode("map")}>Map</button><button className={mode === "table" ? "active" : ""} aria-pressed={mode === "table"} onClick={() => setMode("table")}>Table</button></div></div>
        {error && <div className="notice error" role="alert">{error} {isDemo ? "Try again." : "Check the local package configuration or try again."}</div>}
        {loading && !error && <p role="status">Loading {year} results…</p>}
        {data && geometry && (mode === "map" ? <div className="work"><div className="map-pane"><div className="map-heading"><strong>Turnout by ward</strong><span>{isDemo ? "Invented shapes" : "2025 boundaries"}</span></div><MapView wards={wards} geometry={geometry} data={data} selected={ward} onSelect={selectWard} /><div className="legend"><span>Lower</span><span className="gradient" aria-hidden="true" /><span>Higher turnout</span><span>Grey: unavailable</span></div></div><aside className="detail" aria-live="polite"><div className="kicker">Ward / {isDemo ? "Fictional sample" : "Leeds"}</div><h2>{selectedName}</h2>{contest ? <><p className="sub">{event?.election_date} · {event?.event_kind === "by_election" ? "By-election" : "Council election"}</p><div className="meta"><div><span>Turnout</span><strong>{pct(contest.turnout_rate)}</strong></div><div><span>Seats elected</span><strong>{contest.seats_available}</strong></div></div><h3>{isDemo ? "Invented" : "Recorded"} party vote shares</h3>{parties.map(p => <div className="result" key={p.party_label}><div className="result-label"><span>{p.party_label}</span><span>{pct(p.share_of_candidate_votes)}</span></div><div className="track"><div className="fill" style={{ width: `${p.share_of_candidate_votes * 100}%` }} /></div></div>)}<p className="footnote">Share of all candidate-votes{contest.seats_available > 1 ? "; not a share of voters. Multiple seats contested." : "."}</p></> : <p className="sub">No {isDemo ? "sample" : "imported"} ward result in {year}. {isDemo ? "This fictional ward has no poll in this demo year." : year === "2025" ? "Leeds had no scheduled council poll in 2025." : ""}</p>}<div className="forecast"><h3>Forecast</h3><p className="sub">No published forecast</p></div></aside></div> : <div className="table-wrap"><table className="results-table"><thead><tr><th>Ward</th><th>Poll date</th><th>Seats elected</th><th>Turnout</th></tr></thead><tbody>{wards.map(w => { const c = data.contests.find(row => row.ward_code === w.ward_code); const e = data.events.find(row => row.event_id === c?.event_id); return <tr key={w.ward_code}><td><button className="link-button" onClick={() => { selectWard(w.ward_code); setMode("map"); }}>{w.ward_name}</button></td><td>{e?.election_date ?? "No imported poll"}</td><td>{c?.seats_available ?? "—"}</td><td>{pct(c?.turnout_rate)}</td></tr>; })}</tbody></table></div>)}
        <div className="under"><span>{year} · {data?.contests.length ?? 0} {isDemo ? "fictional" : "imported"} ward poll(s) · Coverage limitations apply</span><button className="link-button" onClick={() => setPage("sources")}>Coverage & sources</button></div></>}
      {page === "forecast" && <><div className="eyebrow">Forecast / retrospective research</div><h1>Historical model tests</h1><p className="muted">These simple benchmarks use earlier election results to predict elections that have already happened. I corrected historical party abbreviations so the same party is compared across years. These figures are not forecasts for a future election.</p><div className="card"><h2>Latest prior ward result</h2>{isDemo ? <p>The fictional preview has no model test data.</p> : forecastError ? <p role="alert">Unable to load model tests: {forecastError}</p> : !backtest ? <p role="status">Loading model tests…</p> : <><p>{backtest.evaluated_wards} single-seat ward polls tested across 2022, 2023, 2024 and 2026.</p><div className="table-wrap"><table className="results-table"><thead><tr><th>Election</th><th>Wards tested</th><th>Average vote-share error</th><th>Winning party correct</th><th>Votes for parties absent in prior ward</th></tr></thead><tbody>{Object.entries(backtest.by_year).map(([testYear, result]) => <tr key={testYear}><td>{testYear}</td><td>{result.single_seat_wards}</td><td>{pct(result.models.last_ward.mean_total_variation)}</td><td>{pct(result.models.last_ward.winner_accuracy)}</td><td>{pct(result.mean_new_party_vote_share)}</td></tr>)}</tbody></table></div><p className="footnote">Average vote-share error is the mean total variation across parties; lower is better. It measures how far the predicted distribution was from the recorded result, not a polling margin of error. The last column shows votes for parties with no result in the previous election in that ward.</p><p className="notice">{backtest.warning}</p><p className="muted">{backtest.exclusions}</p></>}</div></>}
      {page === "sources" && <><div className="eyebrow">Publication details</div><h1>Data & sources</h1><p className="muted">Dates, definitions and gaps behind the Explorer.</p><div className="card"><h2>{isDemo ? "Synthetic owner preview" : "Leeds · local council"}</h2><p>{manifest ? `${format.format(manifest.candidate_records)} candidate records · ${manifest.contests} contests · ${manifest.wards} wards` : "Package unavailable"}</p><p>{isDemo ? "Every record and shape is invented. No real election or census data is included." : "Map display: 2025 ward boundaries for every year. Latest scheduled poll: 7 May 2026. Census and Electoral Tribe layers are not included."}</p><h3>Coverage limits</h3><ul>{manifest?.release_limits.map((limit, i) => <li key={i}>{limit}</li>)}</ul>{!isDemo && manifest?.source_links && <><h3>Source documents</h3><ul>{manifest.source_links.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}</ul></>}{!isDemo && manifest?.attribution && <><h3>Attribution</h3><ul>{manifest.attribution.map(credit => <li key={credit}>{credit}</li>)}</ul></>}{rejected.length > 0 && <p className="notice">{year}: {rejected.length} known event with a rejected source. It is excluded from recorded results.</p>}<p className="footnote">{isDemo ? "The real Leeds development package remains local and is not served by this preview." : `Release: ${manifest?.package_id ?? "unavailable"}. Public results only; no party-supplied data.`}</p></div></>}
    </main></div></>;
}
