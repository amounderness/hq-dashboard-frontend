"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoArea, geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { partyColor } from "@/lib/pulse-colors";

type Coverage = { status: string; reason: string; source_url: string | null };
type Area = { code: string; name: string; status: string; region_code?: string; authority_code?: string; ward_count?: number; coverage?: Record<string, Coverage> };
type Source = { source_id: string; publisher: string; url: string; vintage: string };
type Catalog = { schema_version: number; country: string; pilot_region: string; years: number[]; regions: Area[]; authorities: Area[]; pilot_wards: Area[]; sources: Source[]; geography_summary: Record<string, number>; election_types: { type_id: string; label: string }[] };
type Result = {
  authority_code: string; year: number; coverage: string; explanation?: string; source_release?: string;
  events: { event_id: string; election_date: string; event_kind: string; status: string; source_url?: string }[];
  contests: { contest_id: string; event_id: string; ward_code: string; ward_name: string; seats_available: number; electorate: number | null; turnout_rate: number | null; candidate_votes: number; quality_note?: string; comparability_note?: string; display_boundary_id?: string | null }[];
  candidates: { result_id: string; contest_id: string; candidate_name: string; party_label: string; votes: number | null; elected: number; source_url?: string }[];
};
type Geo = FeatureCollection<Geometry, { code: string; name: string }>;

const YORKSHIRE = "E12000003";
const asPercent = (value: number | null) => value == null ? "Not available" : `${(value * 100).toFixed(1)}%`;
const coverageLabel = (status?: string) => status === "checked_published" ? "Audited Leeds release"
  : status === "partial_by_election_only" ? "Audited by-election only"
  : status === "secondary_source_staged" ? "Secondary source · review needed"
  : status === "no_record_in_annual_source" ? "No annual record · verify events"
  : "No result source imported";

async function load<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", redirect: "manual" });
  if (response.type === "opaqueredirect") throw new Error("Sign-in expired. Reload the page and sign in again.");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Data request failed (${response.status}).`);
  return data as T;
}

function fixRing(feature: Feature<Geometry, { code: string; name: string }>) {
  if (geoArea(feature) <= 2 * Math.PI) return feature;
  const geometry = feature.geometry;
  if (geometry.type === "Polygon") return { ...feature, geometry: { ...geometry, coordinates: geometry.coordinates.map(ring => [...ring].reverse()) } };
  if (geometry.type === "MultiPolygon") return { ...feature, geometry: { ...geometry, coordinates: geometry.coordinates.map(poly => poly.map(ring => [...ring].reverse())) } };
  return feature;
}

function GeographyMap({ geometry, selected, active, onSelect, label }: {
  geometry: Geo; selected: string; active: (code: string) => boolean;
  onSelect: (code: string) => void; label: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 720, height: 470 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setSize({ width: Math.max(300, node.clientWidth), height: Math.max(320, node.clientHeight) }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const displayed = useMemo<Geo>(() => ({ ...geometry, features: geometry.features.map(fixRing) as Geo["features"] }), [geometry]);
  const projection = useMemo(() => geoMercator().fitExtent([[18, 18], [size.width - 18, size.height - 18]], displayed), [displayed, size]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const current = displayed.features.find(feature => feature.properties.code === selected);
  return <svg ref={ref} className="v2-map" viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={label}>
    {displayed.features.map(feature => {
      const code = feature.properties.code;
      const enabled = active(code);
      const name = feature.properties.name;
      return <path key={code} d={path(feature) ?? ""} fill={enabled ? "#9dc7bf" : "#d6dcde"}
        stroke="#fff" strokeWidth={1.1} vectorEffect="non-scaling-stroke" tabIndex={enabled ? 0 : -1}
        role={enabled ? "button" : undefined} aria-label={`${name}${enabled ? ", open area" : ", not in this pilot"}`}
        aria-disabled={!enabled} onClick={() => { if (enabled) onSelect(code); }}
        onKeyDown={event => { if (enabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(code); } }}>
        <title>{name}{enabled ? " · open area" : " · outside pilot"}</title>
      </path>;
    })}
    {current && <g pointerEvents="none" aria-hidden="true"><path d={path(current) ?? ""} fill="none" stroke="#fff" strokeWidth={5} vectorEffect="non-scaling-stroke" /><path d={path(current) ?? ""} fill="none" stroke="#1e3038" strokeWidth={2.4} vectorEffect="non-scaling-stroke" /></g>}
  </svg>;
}

export default function ExplorerV2Page() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [regionsGeo, setRegionsGeo] = useState<Geo | null>(null);
  const [authoritiesGeo, setAuthoritiesGeo] = useState<Geo | null>(null);
  const [wardsGeo, setWardsGeo] = useState<Geo | null>(null);
  const [level, setLevel] = useState<"country" | "region" | "authority">("country");
  const [region, setRegion] = useState("");
  const [authority, setAuthority] = useState("");
  const [ward, setWard] = useState("");
  const [year, setYear] = useState("2026");
  const [resultState, setResultState] = useState<{ authority: string; year: string; data: Result } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let live = true;
    Promise.all([
      load<Catalog>("/api/explorer-v2/catalog"), load<Geo>("/api/explorer-v2/regions"),
      load<Geo>("/api/explorer-v2/authorities"), load<Geo>("/api/explorer-v2/wards"),
    ]).then(([c, r, a, w]) => { if (live) { setCatalog(c); setRegionsGeo(r); setAuthoritiesGeo(a); setWardsGeo(w); setBusy(false); } })
      .catch(cause => { if (live) { setError(cause.message); setBusy(false); } });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!authority) return;
    let live = true;
    load<Result>(`/api/explorer-v2/results?authority=${encodeURIComponent(authority)}&year=${encodeURIComponent(year)}`)
      .then(data => { if (live) { setResultState({ authority, year, data }); setError(""); } })
      .catch(cause => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [authority, year]);
  const result = resultState?.authority === authority && resultState.year === year ? resultState.data : null;
  const selectedAuthority = catalog?.authorities.find(item => item.code === authority);
  const selectedWard = catalog?.pilot_wards.find(item => item.code === ward);
  const wardOptions = useMemo(() => catalog?.pilot_wards.filter(item => item.authority_code === authority) ?? [], [catalog, authority]);
  const historicalWardOptions = result?.contests.filter(item => !wardOptions.some(current => current.code === item.ward_code)) ?? [];
  const authorityOptions = useMemo(() => catalog?.authorities.filter(item => item.region_code === YORKSHIRE) ?? [], [catalog]);
  const selectedContests = result?.contests.filter(item => !ward || item.ward_code === ward) ?? [];
  const localWardGeometry = useMemo<Geo | null>(() => wardsGeo && authority ? {
    type: "FeatureCollection", features: wardsGeo.features.filter(feature => wardOptions.some(item => item.code === feature.properties.code)),
  } : null, [wardsGeo, authority, wardOptions]);
  const localAuthorityGeometry = useMemo<Geo | null>(() => authoritiesGeo && level === "region" ? {
    type: "FeatureCollection", features: authoritiesGeo.features.filter(feature => authorityOptions.some(item => item.code === feature.properties.code)),
  } : null, [authoritiesGeo, level, authorityOptions]);
  const openAuthority = (code: string) => { setAuthority(code); setWard(""); setRegion(YORKSHIRE); setLevel("authority"); };
  const openRegion = () => { setRegion(YORKSHIRE); setAuthority(""); setWard(""); setLevel("region"); };

  return <>
    <div className="heading"><div><div className="eyebrow">England / Explorer v2 pilot</div><h1>Explore beyond Leeds</h1><p>Navigate the national geography register. Yorkshire and Humber is the first wider test region; every available result carries its review status and source.</p></div><span className="badge">Staged research view</span></div>
    <div className="notice" role="status"><strong>Staged regional pilot.</strong> Grey regions are outside this pilot. Leeds uses its audited release; other Yorkshire and Humber results come from a secondary compilation and still need council checks. Annual files may omit by-elections. An empty result is not a zero-vote or no-election claim.</div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {busy && <p role="status">Loading the geography catalogue…</p>}
    {catalog && <>
      <div className="v2-crumbs" aria-label="Geography"><button onClick={() => { setLevel("country"); setRegion(""); setAuthority(""); setWard(""); }}>England</button>{region && <><span>›</span><button onClick={openRegion}>Yorkshire and Humber</button></>}{authority && <><span>›</span><span>{selectedAuthority?.name}</span></>}</div>
      <div className="toolbar">
        <label className="field">Region<select value={region} onChange={event => event.target.value === YORKSHIRE ? openRegion() : (setRegion(""), setAuthority(""), setWard(""), setLevel("country"))}><option value="">England · all regions</option>{catalog.regions.map(item => <option value={item.code} key={item.code} disabled={item.code !== YORKSHIRE}>{item.name}{item.code !== YORKSHIRE ? " · later" : ""}</option>)}</select></label>
        <label className="field">Council<select value={authority} onChange={event => event.target.value ? openAuthority(event.target.value) : openRegion()} disabled={!region}><option value="">Select a council</option>{authorityOptions.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
        <label className="field">Election type<select value="local_council" onChange={() => {}}>{catalog.election_types.map(item => <option key={item.type_id} value={item.type_id} disabled={item.type_id !== "local_council"}>{item.label}{item.type_id === "local_council" ? "" : " · not yet imported"}</option>)}</select></label>
        <label className="field">Election year<select value={year} onChange={event => setYear(event.target.value)}>{[...catalog.years].reverse().map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        {authority && <label className="field">Ward<select value={ward} onChange={event => setWard(event.target.value)}><option value="">All wards</option>{wardOptions.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}{historicalWardOptions.length > 0 && <optgroup label="Historical wards · not mapped">{historicalWardOptions.map(item => <option key={item.ward_code} value={item.ward_code}>{item.ward_name}</option>)}</optgroup>}</select></label>}
      </div>
      <div className="v2-layout"><div className="map-pane"><div className="map-heading"><strong>{level === "country" ? "English regions" : level === "region" ? "Yorkshire and Humber councils" : `${selectedAuthority?.name ?? "Council"} wards`}</strong><span>ONS 2025 boundary editions</span></div>
        {level === "country" && regionsGeo && <GeographyMap geometry={regionsGeo} selected={region} active={code => code === YORKSHIRE} onSelect={openRegion} label="English regions; Yorkshire and Humber is open for pilot exploration" />}
        {level === "region" && localAuthorityGeometry && <GeographyMap geometry={localAuthorityGeometry} selected={authority} active={() => true} onSelect={openAuthority} label="Yorkshire and Humber local authorities" />}
        {level === "authority" && localWardGeometry && <GeographyMap geometry={localWardGeometry} selected={ward} active={() => true} onSelect={setWard} label={`${selectedAuthority?.name ?? "Council"} 2025 wards`} />}
        <p className="footnote">Boundaries: <a href="https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_DEC_2025_Boundaries_UK_BSC/FeatureServer" target="_blank" rel="noreferrer">ONS authority dataset</a>, <a href="https://ckan.publishing.service.gov.uk/dataset/wards-may-2025-boundaries-uk-bsc-v2" target="_blank" rel="noreferrer">ONS ward dataset</a>. Historical poll boundaries have not yet been fully reconciled to these shapes.</p>
      </div><aside className="detail"><div className="kicker">{level === "authority" ? "Council / area record" : "Coverage / exploration"}</div><h2>{level === "country" ? "England" : level === "region" ? "Yorkshire and Humber" : selectedWard?.name ?? result?.contests.find(item => item.ward_code === ward)?.ward_name ?? selectedAuthority?.name}</h2>
        {level === "country" && <p>{catalog.regions.length} regions, {catalog.authorities.length} local authorities, {catalog.geography_summary.county_or_unitary ?? 0} county areas, {catalog.geography_summary.combined_authority ?? 0} combined authorities and {(catalog.geography_summary.parish_or_non_parished_area ?? 0).toLocaleString("en-GB")} parish or non-parished areas are indexed. Select Yorkshire and Humber to inspect the first regional pilot. Other regions remain grey until a checked release is available.</p>}
        {level === "region" && <><p>{authorityOptions.length} local authorities and {catalog.pilot_wards.length} current wards are indexed here. Select a council. The status beside each council applies only to the selected year.</p><ul className="v2-area-list">{authorityOptions.map(item => <li key={item.code}><button onClick={() => openAuthority(item.code)}>{item.name}</button><small>{coverageLabel(item.coverage?.[year]?.status)}</small></li>)}</ul></>}
        {level === "authority" && <><p><strong>{year} coverage:</strong> {coverageLabel(selectedAuthority?.coverage?.[year]?.status)}</p><p className="footnote">{selectedAuthority?.coverage?.[year]?.reason}</p>{selectedAuthority?.coverage?.[year]?.source_url && <p><a href={selectedAuthority.coverage[year].source_url!} target="_blank" rel="noreferrer">Result source and methods</a></p>}{!result && <p role="status">Loading results…</p>}{result && <><p>{selectedContests.length} recorded contest{selectedContests.length === 1 ? "" : "s"} in this selection.</p>{selectedContests.length === 0 && <p className="notice small-notice">{result.explanation ?? "No imported contest for this selection. Check the coverage status; this does not prove no poll occurred."}</p>}{!ward && selectedContests.length > 0 && <><p className="footnote">Choose a ward to see candidate votes. Historical wards that do not match the current map are listed below but cannot be highlighted yet.</p><ul className="v2-area-list">{selectedContests.map(contest => <li key={contest.contest_id}><button onClick={() => setWard(contest.ward_code)}>{contest.ward_name}</button><small>{contest.seats_available} seat{contest.seats_available === 1 ? "" : "s"}{contest.display_boundary_id ? "" : " · historical boundary unmapped"}</small></li>)}</ul></>}{ward && selectedContests.map(contest => {
          const event = result.events.find(item => item.event_id === contest.event_id);
          const candidates = result.candidates.filter(item => item.contest_id === contest.contest_id).sort((a, b) => (b.votes ?? -1) - (a.votes ?? -1));
          return <section className="v2-contest" key={contest.contest_id}><h3>{contest.ward_name}</h3><p>{event?.election_date ?? "Date unavailable"} · {event?.event_kind === "by_election" ? "By-election" : "Council election"} · {contest.seats_available} seat{contest.seats_available === 1 ? "" : "s"} filled · turnout {asPercent(contest.turnout_rate)}</p><ol>{candidates.map(candidate => <li key={candidate.result_id}><span className="party-swatch" style={{ background: partyColor(candidate.party_label) }} aria-hidden="true" />{candidate.candidate_name} · {candidate.party_label}{candidate.elected ? " · elected" : ""}<strong>{candidate.votes == null ? "—" : candidate.votes.toLocaleString("en-GB")}</strong>{candidate.source_url && <a href={candidate.source_url} target="_blank" rel="noreferrer" aria-label={`Source for ${candidate.candidate_name}`}>Source</a>}</li>)}</ol>{event?.source_url && <p className="footnote"><a href={event.source_url} target="_blank" rel="noreferrer">Underlying {year} source series</a></p>}{contest.quality_note && <p className="footnote">{contest.quality_note}</p>}{contest.comparability_note && <p className="footnote">Map note: {contest.comparability_note}</p>}</section>;
        })}{ward && selectedContests.length === 0 && <p className="footnote">There is no recorded contest for this current ward in the selected year. This does not prove no election took place.</p>}</>}</>}
      </aside></div>
      <div className="under"><span>Sources: ONS 2025 geography · Leeds v0.6.0 · <a href="https://electionresults.uk/councils/data" target="_blank" rel="noreferrer">electionresults.uk secondary compilation</a> of Commons Library and Democracy Club results</span><a href="https://www.ons.gov.uk/methodology/geography/licences" target="_blank" rel="noreferrer">Geography licence and attribution</a></div>
    </>}
  </>;
}
