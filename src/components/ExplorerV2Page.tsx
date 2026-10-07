"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoArea, geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { canonicalParty, partyColor, tribeColors } from "@/lib/pulse-colors";
import type { WardHistory, WardProfile } from "@/lib/pulse-types";
import type { CompositionData } from "@/lib/pulse-insight-types";
import CompositionView from "./CompositionView";

type Coverage = { status: string; reason: string; source_url: string | null };
type Activity = { contest_count: number; sdp_contested_wards: string[]; winner_counts: Record<string, number>; party_candidate_votes: Record<string, number>; candidate_votes: number; mean_recorded_turnout: number | null; turnout_contests: number };
type Area = { code: string; name: string; status: string; region_code?: string; authority_code?: string; ward_count?: number; coverage?: Record<string, Coverage>; ward_edition_by_year?: Record<string, string> };
type Catalog = { schema_version: number; audience_scope?: string; released_authorities?: string[]; country: string; pilot_region: string; years: number[]; regions: Area[]; authorities: Area[]; pilot_wards: Area[]; pilot_wards_by_edition?: Record<string, Area[]>; activity: Record<string, Record<string, Activity>>; geography_summary: Record<string, number>; election_types: { type_id: string; label: string }[] };
type Contest = { contest_id: string; event_id: string; ward_code: string; ward_name: string; seats_available: number; electorate: number | null; turnout_rate: number | null; candidate_votes: number; quality_note?: string; comparability_note?: string; display_boundary_id?: string | null };
type Candidate = { result_id: string; contest_id: string; candidate_name: string; party_label: string; votes: number | null; elected: number };
type Result = { authority_code: string; year: number; coverage: string; explanation?: string; source_release?: string; events: { event_id: string; election_date: string; event_kind: string; status: string; source_url?: string }[]; contests: Contest[]; candidates: Candidate[] };
type Geo = FeatureCollection<Geometry, { code: string; name: string }>;
type View = "map" | "table" | "composition";
type Layer = "winners" | "turnout" | "tribes";
type DetailTab = "results" | "census" | "tribes" | "history";

const YORKSHIRE = "E12000003";
const LEEDS = "E08000035";
const displayAreaName = (code: string, name: string) => code === LEEDS ? "Leeds City Council" : name;
const number = new Intl.NumberFormat("en-GB");
const percent = (value: number | null | undefined) => value == null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;
const coverageLabel = (status?: string) => status === "checked_published" ? "Audited Leeds release"
  : status === "partial_by_election_only" ? "By-election only"
  : status === "not_released" ? "Not released to viewers"
  : status === "secondary_source_staged" ? "Secondary source · review needed"
  : status === "no_record_in_annual_source" ? "No annual record · check events"
  : "No imported result";
const dateText = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
const eventKindLabel = (kind: string | undefined) => kind === "by_election" ? "By-election"
  : kind === "postponed_ordinary_election" ? "Postponed council election" : "Council election";

async function load<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", redirect: "manual" });
  if (response.type === "opaqueredirect" || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Sign-in expired. Reload and sign in again.");
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

function tallyWinners(contests: Contest[], candidates: Candidate[]) {
  const ids = new Set(contests.map(contest => contest.contest_id));
  const counts: Record<string, number> = {};
  for (const candidate of candidates) if (ids.has(candidate.contest_id) && candidate.elected) {
    const party = canonicalParty(candidate.party_label);
    counts[party] = (counts[party] ?? 0) + 1;
  }
  return counts;
}

function latestLeedsResult(results: Result[]): Result {
  const newestDate = new Map<string, string>();
  for (const result of results) {
    const dates = new Map(result.events.map(event => [event.event_id, event.election_date]));
    for (const contest of result.contests) {
      const date = dates.get(contest.event_id) ?? "";
      if (date > (newestDate.get(contest.ward_code) ?? "")) newestDate.set(contest.ward_code, date);
    }
  }
  const contests = results.flatMap(result => {
    const dates = new Map(result.events.map(event => [event.event_id, event.election_date]));
    return result.contests.filter(contest => dates.get(contest.event_id) === newestDate.get(contest.ward_code));
  });
  const contestIds = new Set(contests.map(contest => contest.contest_id));
  const eventIds = new Set(contests.map(contest => contest.event_id));
  return {
    ...results.at(-1)!,
    events: results.flatMap(result => result.events.filter(event => eventIds.has(event.event_id))),
    contests,
    candidates: results.flatMap(result => result.candidates.filter(candidate => contestIds.has(candidate.contest_id))),
  };
}

function leadingParties(counts: Record<string, number>) {
  const highest = Math.max(0, ...Object.values(counts));
  return highest ? Object.entries(counts).filter(([, count]) => count === highest).map(([party]) => party).sort() : [];
}

function turnoutColor(rate: number | null | undefined) {
  if (rate == null) return "#d6dcde";
  const fraction = Math.max(0, Math.min(1, (rate - .2) / .5));
  const low = [206, 229, 228], high = [25, 96, 111];
  return `rgb(${low.map((value, index) => Math.round(value + (high[index] - value) * fraction)).join(",")})`;
}

function GeographyMap({ geometry, selected, enabled, dimmed, fill, description, onSelect, label }: {
  geometry: Geo; selected: string; enabled: (code: string) => boolean; dimmed: (code: string) => boolean;
  fill: (code: string) => string; description: (code: string, name: string) => string;
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
    <defs><pattern id="v2-mixed-winners" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#8d9cab" /><rect width="5" height="10" fill="#eef2f6" /></pattern></defs>
    {displayed.features.map(feature => {
      const code = feature.properties.code, canOpen = enabled(code), name = feature.properties.name;
      const text = description(code, name);
      return <path key={code} d={path(feature) ?? ""} fill={fill(code)} opacity={dimmed(code) ? .18 : 1}
        stroke="#fff" strokeWidth={1.1} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        tabIndex={canOpen ? 0 : -1} role={canOpen ? "button" : undefined} aria-label={text}
        aria-pressed={canOpen ? code === selected : undefined} aria-disabled={!canOpen}
        onClick={() => { if (canOpen) onSelect(code); }}
        onKeyDown={event => { if (canOpen && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(code); } }}><title>{text}</title></path>;
    })}
    {current && <g pointerEvents="none" aria-hidden="true"><path d={path(current) ?? ""} fill="none" stroke="#fff" strokeWidth={5} vectorEffect="non-scaling-stroke" /><path d={path(current) ?? ""} fill="none" stroke="#1e3038" strokeWidth={2.4} vectorEffect="non-scaling-stroke" /></g>}
  </svg>;
}

function PartyBars({ votes, total, winners, multiSeat, compact = false }: { votes: Record<string, number>; total: number; winners: string[]; multiSeat: boolean; compact?: boolean }) {
  const rows = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  if (!rows.length || !total) return <p className="sub">No candidate-vote breakdown is imported for this selection.</p>;
  const shown = compact ? rows.slice(0, 7) : rows;
  const remainder = compact ? rows.slice(7) : [];
  const otherVotes = remainder.reduce((sum, [, votes]) => sum + votes, 0);
  return <><h3>Party candidate-vote shares</h3>{shown.map(([party, count]) => <div className="result" key={party}><div className="result-label"><span><span className="party-swatch" style={{ background: partyColor(party) }} aria-hidden="true" />{party}{winners.includes(party) ? " ✓" : ""}</span><span>{percent(count / total)}</span></div><div className="track"><div className="fill" style={{ width: `${count / total * 100}%`, background: partyColor(party) }} /></div></div>)}{remainder.length > 0 && <><div className="result-label"><span>Other parties ({remainder.length})</span><span>{percent(otherVotes / total)}</span></div><details className="v2-more-parties"><summary>Show remaining parties</summary><ul>{remainder.map(([party, count]) => <li key={party}>{party}: {percent(count / total)}</li>)}</ul></details></>}<p className="footnote">Shares divide each party&apos;s candidate votes by all candidate votes in the selected recorded poll{multiSeat ? "s. Multi-seat polls mean these are not shares of voters." : "."}</p></>;
}

export default function ExplorerV2Page({ profiles, history, composition }: { profiles: WardProfile[]; history: WardHistory; composition: CompositionData | null }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [regionsGeo, setRegionsGeo] = useState<Geo | null>(null);
  const [authoritiesGeo, setAuthoritiesGeo] = useState<Geo | null>(null);
  const [wardsGeo, setWardsGeo] = useState<Geo | null>(null);
  const [wardsGeo2026, setWardsGeo2026] = useState<Geo | null>(null);
  const [level, setLevel] = useState<"country" | "region" | "authority">("country");
  const [authority, setAuthority] = useState("");
  const [ward, setWard] = useState("");
  const [year, setYear] = useState("2026");
  const [view, setView] = useState<View>("map");
  const [layer, setLayer] = useState<Layer>("winners");
  const [winningParty, setWinningParty] = useState("");
  const [sdpOnly, setSdpOnly] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("results");
  const [selectedPoll, setSelectedPoll] = useState("");
  const [resultState, setResultState] = useState<{ authority: string; year: string; data: Result } | null>(null);
  const [historyState, setHistoryState] = useState<{ authority: string; data: Result[] } | null>(null);
  const [resultFailure, setResultFailure] = useState<{ authority: string; year: string; message: string } | null>(null);
  const [historyFailure, setHistoryFailure] = useState<{ authority: string; message: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let live = true;
    Promise.all([load<Catalog>("/api/explorer-v2/catalog"), load<Geo>("/api/explorer-v2/regions"), load<Geo>("/api/explorer-v2/authorities"), load<Geo>("/api/explorer-v2/wards")])
      .then(async ([c, r, a, w]) => {
        const w2026 = c.schema_version === 2 ? await load<Geo>("/api/explorer-v2/wards?edition=2026-05") : null;
        if (live) { setCatalog(c); setRegionsGeo(r); setAuthoritiesGeo(a); setWardsGeo(w); setWardsGeo2026(w2026); setBusy(false); }
      })
      .catch(cause => { if (live) { setError(cause.message); setBusy(false); } });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!authority) return;
    let live = true;
    const request = year === "latest" && authority === LEEDS && catalog
      ? Promise.all(catalog.years.map(value => load<Result>(`/api/explorer-v2/results?authority=${authority}&year=${value}`))).then(latestLeedsResult)
      : load<Result>(`/api/explorer-v2/results?authority=${encodeURIComponent(authority)}&year=${year}`);
    request
      .then(data => { if (live) { setResultState({ authority, year, data }); setResultFailure(null); } })
      .catch(cause => { if (live) setResultFailure({ authority, year, message: cause.message }); });
    return () => { live = false; };
  }, [authority, year, catalog]);
  useEffect(() => {
    if (!catalog || !authority || detailTab !== "history" || authority === LEEDS || historyState?.authority === authority || historyFailure?.authority === authority) return;
    let live = true;
    Promise.all(catalog.years.map(value => load<Result>(`/api/explorer-v2/results?authority=${encodeURIComponent(authority)}&year=${value}`)))
      .then(data => { if (live) { setHistoryState({ authority, data }); setHistoryFailure(null); } })
      .catch(cause => { if (live) setHistoryFailure({ authority, message: cause.message }); });
    return () => { live = false; };
  }, [catalog, authority, detailTab, historyState, historyFailure]);

  const result = resultState?.authority === authority && resultState.year === year ? resultState.data : null;
  const resultError = resultFailure?.authority === authority && resultFailure.year === year ? resultFailure.message : "";
  const historyError = historyFailure?.authority === authority ? historyFailure.message : "";
  const resultsLoading = !!authority && !result && !resultError;
  const pilotAuthorities = useMemo(() => catalog?.authorities.filter(item => item.region_code === YORKSHIRE).map(item => ({ ...item, name: displayAreaName(item.code, item.name) })) ?? [], [catalog]);
  const canOpenAuthority = (code: string) => !catalog?.released_authorities || catalog.released_authorities.includes(code);
  const authorityArea = pilotAuthorities.find(item => item.code === authority);
  const selectedContests = result?.contests.filter(item => !ward || item.ward_code === ward) ?? [];
  const currentContest = selectedContests.find(item => item.contest_id === selectedPoll) ?? selectedContests.at(-1);
  const defaultWardEdition = authorityArea?.ward_edition_by_year?.[year === "latest" ? String(catalog?.years.at(-1)) : year] ?? "2025-05";
  const mapEdition = ward && currentContest?.display_boundary_id?.endsWith(":2026-05") ? "2026-05"
    : ward && currentContest?.display_boundary_id?.endsWith(":2025-05") ? "2025-05" : defaultWardEdition;
  const wardOptions = (catalog?.pilot_wards_by_edition?.[mapEdition] ?? catalog?.pilot_wards ?? [])
    .filter(item => item.authority_code === authority);
  const historicalOptions = [...new Map((result?.contests ?? []).filter(item => !wardOptions.some(current => current.code === item.ward_code)).map(item => [item.ward_code, item.ward_name])).entries()];
  const selectedWardName = wardOptions.find(item => item.code === ward)?.name ?? historicalOptions.find(([code]) => code === ward)?.[1];
  const currentEvent = result?.events.find(item => item.event_id === currentContest?.event_id);
  const currentCandidates = result?.candidates.filter(item => item.contest_id === currentContest?.contest_id).sort((a, b) => (b.votes ?? -1) - (a.votes ?? -1)) ?? [];
  const activity = catalog?.activity ?? {};
  const latestActivity: Activity | null = year === "latest" && authority === LEEDS && result ? (() => {
    const party_candidate_votes: Record<string, number> = {};
    for (const candidate of result.candidates) if (candidate.votes != null) {
      const party = canonicalParty(candidate.party_label);
      party_candidate_votes[party] = (party_candidate_votes[party] ?? 0) + candidate.votes;
    }
    const sdpIds = new Set(result.candidates.filter(candidate => canonicalParty(candidate.party_label) === "SDP").map(candidate => candidate.contest_id));
    const rates = result.contests.map(contest => contest.turnout_rate).filter((rate): rate is number => rate != null);
    return { contest_count: result.contests.length,
      sdp_contested_wards: [...new Set(result.contests.filter(contest => sdpIds.has(contest.contest_id)).map(contest => contest.ward_code))],
      winner_counts: tallyWinners(result.contests, result.candidates), party_candidate_votes,
      candidate_votes: result.contests.reduce((sum, contest) => sum + contest.candidate_votes, 0),
      mean_recorded_turnout: rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null,
      turnout_contests: rates.length };
  })() : null;
  const activityFor = (code: string) => code === LEEDS && latestActivity
    ? latestActivity : activity[code]?.[year === "latest" ? String(catalog?.years.at(-1)) : year];
  const regionalActivity = pilotAuthorities.map(item => activityFor(item.code)).filter((item): item is Activity => !!item);
  const availableActivities = level === "authority" ? (activityFor(authority) ? [activityFor(authority)!] : []) : regionalActivity;
  const areaWinnerCounts: Record<string, number> = {};
  const areaPartyVotes: Record<string, number> = {};
  for (const item of availableActivities) {
    for (const [party, count] of Object.entries(item.winner_counts)) areaWinnerCounts[party] = (areaWinnerCounts[party] ?? 0) + count;
    for (const [party, votes] of Object.entries(item.party_candidate_votes)) areaPartyVotes[party] = (areaPartyVotes[party] ?? 0) + votes;
  }
  const areaTotalVotes = availableActivities.reduce((sum, item) => sum + item.candidate_votes, 0);
  const areaContestCount = availableActivities.reduce((sum, item) => sum + item.contest_count, 0);
  const areaSdpCouncils = pilotAuthorities.filter(item => (activityFor(item.code)?.sdp_contested_wards.length ?? 0) > 0).length;
  const latestWardContests = (code: string) => {
    const contests = result?.contests.filter(item => item.ward_code === code && item.display_boundary_id === `${code}:${mapEdition}`) ?? [];
    const eventDates = new Map(result?.events.map(item => [item.event_id, item.election_date]) ?? []);
    const latestDate = contests.reduce((value, item) => {
      const date = eventDates.get(item.event_id) ?? "";
      return date > value ? date : value;
    }, "");
    return contests.filter(item => eventDates.get(item.event_id) === latestDate);
  };
  const winnerFor = (code: string) => {
    if (level === "country") return leadingParties(areaWinnerCounts);
    if (level === "region") return leadingParties(activityFor(code)?.winner_counts ?? {});
    return result ? leadingParties(tallyWinners(latestWardContests(code), result.candidates)) : [];
  };
  const electedPartiesFor = (code: string) => {
    if (level === "country") return Object.keys(areaWinnerCounts);
    if (level === "region") return Object.keys(activityFor(code)?.winner_counts ?? {});
    return result ? Object.keys(tallyWinners(latestWardContests(code), result.candidates)) : [];
  };
  const mapCodes = level === "country" ? [YORKSHIRE] : level === "region" ? pilotAuthorities.map(item => item.code) : wardOptions.map(item => item.code);
  const winnerOptions = [...new Set(mapCodes.flatMap(code => electedPartiesFor(code)))].sort();
  const legendOptions = [...new Set(mapCodes.flatMap(code => winnerFor(code)))].sort();
  const turnoutFor = (code: string) => {
    if (level === "country") {
      const count = regionalActivity.reduce((sum, item) => sum + item.turnout_contests, 0);
      return code === YORKSHIRE && count ? regionalActivity.reduce((sum, item) => sum + (item.mean_recorded_turnout ?? 0) * item.turnout_contests, 0) / count : null;
    }
    if (level === "region") return activityFor(code)?.mean_recorded_turnout;
    const rates = latestWardContests(code).filter(item => item.turnout_rate != null).map(item => item.turnout_rate!);
    return rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null;
  };
  const sdpFor = (code: string) => level === "country" ? (code === YORKSHIRE && areaSdpCouncils > 0)
    : level === "region" ? (activityFor(code)?.sdp_contested_wards.length ?? 0) > 0
    : result?.contests.some(contest => contest.ward_code === code && contest.display_boundary_id === `${code}:${mapEdition}`
      && result.candidates.some(candidate => candidate.contest_id === contest.contest_id && canonicalParty(candidate.party_label) === "SDP")) ?? false;
  const mapFill = (code: string) => {
    if (level === "country" && code !== YORKSHIRE) return "#d6dcde";
    if (level === "region" && !canOpenAuthority(code)) return "#d6dcde";
    if (layer === "tribes") {
      const profile = authority === LEEDS ? profiles.find(item => item.ward_code === code) : null;
      return profile ? tribeColors[profile.dominant_tribe_id] : "#d6dcde";
    }
    if (layer === "turnout") return turnoutColor(turnoutFor(code));
    const winners = winnerFor(code);
    return winners.length > 1 ? "url(#v2-mixed-winners)" : winners.length ? partyColor(winners[0]) : "#d6dcde";
  };
  const selectedWardGeometry = mapEdition === "2026-05" ? wardsGeo2026 : wardsGeo;
  const localWardGeometry: Geo | null = selectedWardGeometry && authority
    ? { type: "FeatureCollection", features: selectedWardGeometry.features.filter(feature => wardOptions.some(item => item.code === feature.properties.code)) }
    : null;
  const localAuthorityGeometry = useMemo<Geo | null>(() => authoritiesGeo ? { type: "FeatureCollection", features: authoritiesGeo.features.filter(feature => pilotAuthorities.some(item => item.code === feature.properties.code)) } : null, [authoritiesGeo, pilotAuthorities]);
  const mapGeometry = level === "country" ? regionsGeo : level === "region" ? localAuthorityGeometry : localWardGeometry;
  const displayedWard = ward && wardOptions.some(item => item.code === ward)
    && (!currentContest || currentContest.display_boundary_id === `${ward}:${mapEdition}`) ? ward : "";
  const profile = authority === LEEDS ? profiles.find(item => item.ward_code === ward) : undefined;
  const selectedHistory = authority === LEEDS ? history[ward] ?? [] : (historyState?.authority === authority ? historyState.data.flatMap(data => data.contests.filter(item => item.ward_code === ward).map(contest => ({
    date: data.events.find(event => event.event_id === contest.event_id)?.election_date ?? "",
    kind: data.events.find(event => event.event_id === contest.event_id)?.event_kind ?? "ordinary",
    winners: data.candidates.filter(candidate => candidate.contest_id === contest.contest_id && candidate.elected).map(candidate => canonicalParty(candidate.party_label)).join(", "),
    status: data.coverage,
  }))).sort((a, b) => b.date.localeCompare(a.date)) : []);
  const visibleContests = selectedContests.filter(contest => (!sdpOnly || result?.candidates.some(candidate => candidate.contest_id === contest.contest_id && canonicalParty(candidate.party_label) === "SDP")) && (!winningParty || Object.keys(tallyWinners([contest], result?.candidates ?? [])).includes(winningParty)));
  const visibleAuthorities = pilotAuthorities.filter(item => (!sdpOnly || (activityFor(item.code)?.sdp_contested_wards.length ?? 0) > 0) && (!winningParty || (activityFor(item.code)?.winner_counts[winningParty] ?? 0) > 0));
  const sourceUrl = year === "latest" ? null : authorityArea?.coverage?.[year]?.source_url;
  const yearLabel = year === "latest" ? "Latest recorded" : year;
  const mapDescription = (code: string, name: string) => {
    const tribe = authority === LEEDS ? profiles.find(item => item.ward_code === code) : null;
    const detail = level === "country" && code !== YORKSHIRE ? "not in this release"
      : level === "region" && !canOpenAuthority(code) ? "results not released to viewers"
      : layer === "tribes" ? `dominant neighbourhood group ${tribe?.tribes.find(item => item.id === tribe.dominant_tribe_id)?.name ?? "unavailable"}`
      : level === "authority" && resultsLoading ? "loading results"
      : level === "authority" && resultError ? "results unavailable"
      : layer === "winners" ? `most elected ${winnerFor(code).join(" and ") || "not recorded"}`
      : `mean recorded turnout ${percent(turnoutFor(code))}`;
    return `${displayAreaName(code, name)}: ${detail}${sdpFor(code) ? "; SDP stood in an imported poll" : ""}`;
  };
  const mapLabel = `${level === "country" ? "England regions" : level === "region" ? "Yorkshire and Humber councils" : `${authorityArea?.name} wards`} coloured by ${layer === "tribes" ? "dominant Electoral Tribe" : layer === "winners" ? "most elected party" : "mean recorded turnout"}`;

  const openCountry = () => { setLevel("country"); setAuthority(""); setWard(""); if (year === "latest") setYear(String(catalog?.years.at(-1) ?? 2026)); if (layer === "tribes") setLayer("winners"); };
  const openRegion = () => { setLevel("region"); setAuthority(""); setWard(""); setSelectedPoll(""); setWinningParty(""); setDetailTab("results"); if (year === "latest") setYear(String(catalog?.years.at(-1) ?? 2026)); if (layer === "tribes") setLayer("winners"); };
  const openAuthority = (code: string) => { if (!canOpenAuthority(code)) return; setResultFailure(null); setLevel("authority"); setAuthority(code); setWard(""); setSelectedPoll(""); setWinningParty(""); setDetailTab("results"); if (year === "latest" && code !== LEEDS) setYear(String(catalog?.years.at(-1) ?? 2026)); if (layer === "tribes" && code !== LEEDS) setLayer("winners"); };
  const openWard = (code: string) => { setWard(code); setSelectedPoll(""); setDetailTab("results"); };

  return <>
    <div className="heading"><div><div className="eyebrow">England / Explorer v2</div><h1>Explore elections</h1><p>Results, geography and neighbourhood context in one workspace.</p></div><span className="badge">{catalog ? catalog.audience_scope === "leeds_viewers" ? "Leeds City Council data" : "Owner test · Yorkshire and Humber" : "Loading release"}</span></div>
    {catalog && <div className="notice v2-notice" role="status">{catalog.audience_scope === "leeds_viewers" ? <><strong>Leeds results only.</strong> Leeds City Council uses the audited Pulse v0.6.0 record. Other regions and councils are geographic context, greyed out until separately reviewed and released. An empty year does not prove that no poll took place.</> : <><strong>Regional test data.</strong> Leeds uses its audited release. Other ordinary results come from a secondary source awaiting council checks; selected council by-elections are separately sourced. Event lists may still be incomplete. Grey regions are outside this release. An empty year does not prove that no poll took place.</>}</div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    {busy && <p role="status">Loading Explorer v2…</p>}
    {catalog && <>
      <div className="v2-crumbs" aria-label="Geography"><button onClick={openCountry}>England</button>{level !== "country" && <><span>›</span><button onClick={openRegion}>Yorkshire and Humber</button></>}{authority && <><span>›</span><span>{authorityArea?.name}</span></>}</div>
      <div className="toolbar v2-toolbar">
        <label className="field">Region<select value={level === "country" ? "" : YORKSHIRE} onChange={event => event.target.value ? openRegion() : openCountry()}><option value="">England · all regions</option>{catalog.regions.map(item => <option value={item.code} key={item.code} disabled={item.code !== YORKSHIRE}>{item.name}{item.code !== YORKSHIRE ? " · later" : ""}</option>)}</select></label>
        <label className="field">Council<select value={authority} onChange={event => event.target.value ? openAuthority(event.target.value) : openRegion()} disabled={level === "country"}><option value="">All councils</option>{pilotAuthorities.map(item => <option key={item.code} value={item.code} disabled={!canOpenAuthority(item.code)}>{item.name}{canOpenAuthority(item.code) ? "" : " · not released"}</option>)}</select></label>
        <label className="field">Election type<select value="local_council" onChange={() => {}}>{catalog.election_types.map(item => <option key={item.type_id} value={item.type_id} disabled={item.type_id !== "local_council"}>{item.label}{item.type_id === "local_council" ? "" : " · coming later"}</option>)}</select></label>
        <label className="field">Year<select value={year} onChange={event => { setResultFailure(null); setYear(event.target.value); setSelectedPoll(""); setWinningParty(""); }}>{authority === LEEDS && <option value="latest">Latest recorded</option>}{[...catalog.years].reverse().map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        {authority && view !== "composition" && <label className="field">Ward<select value={ward} onChange={event => openWard(event.target.value)}><option value="">All wards</option>{wardOptions.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}{historicalOptions.length > 0 && <optgroup label="Other poll editions or unmapped">{historicalOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</optgroup>}</select></label>}
        {view !== "composition" && <label className="field">Map colour<select value={layer} onChange={event => { setLayer(event.target.value as Layer); setWinningParty(""); }}><option value="winners">Winning party</option><option value="turnout">Turnout</option><option value="tribes" disabled={authority !== LEEDS || profiles.length === 0}>{authority === LEEDS ? "Electoral Tribes" : "Electoral Tribes · Leeds only"}</option></select></label>}
        {view !== "composition" && layer === "winners" && <label className="field">Show winners<select value={winningParty} onChange={event => setWinningParty(event.target.value)}><option value="">All parties</option>{winnerOptions.map(party => <option key={party} value={party}>{party}</option>)}</select></label>}
        {view !== "composition" && <label className="contested-filter"><input type="checkbox" checked={sdpOnly} onChange={event => setSdpOnly(event.target.checked)} />SDP contested only</label>}
        <div className="switch" role="group" aria-label="Explorer view">{(["map", "table", "composition"] as const).map(item => <button key={item} className={view === item ? "active" : ""} aria-pressed={view === item} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
      </div>
      {view === "composition" ? (authority === LEEDS && composition ? <CompositionView data={composition} year={year} /> : <div className="card composition-missing"><h2>Verified council composition unavailable</h2><p>{authority ? `${authorityArea?.name} does not yet have a dated, checked composition snapshot in this release.` : "Choose a council with a checked composition snapshot. The Yorkshire and Humber figures cannot be inferred by adding the winners of one election year."}</p><p className="footnote">Only Leeds City Council has a verified council composition series in this owner test.</p></div>) : view === "table" ? <div className="table-wrap v2-table-wrap"><table className="results-table"><thead><tr>{level === "authority" ? <><th>Ward / poll</th><th>Candidate</th><th>Party</th><th>Votes</th><th>Share of candidate votes</th><th>Elected</th><th>Turnout</th></> : <><th>Area</th><th>Imported contests</th><th>Most elected candidates</th><th>SDP contested wards</th><th>Coverage</th></>}</tr></thead><tbody>{level === "authority" ? visibleContests.flatMap(contest => {
        const event = result?.events.find(item => item.event_id === contest.event_id);
        return (result?.candidates.filter(candidate => candidate.contest_id === contest.contest_id) ?? []).sort((a, b) => (b.votes ?? -1) - (a.votes ?? -1)).map(candidate => <tr key={candidate.result_id}><td><button className="link-button" onClick={() => { openWard(contest.ward_code); setSelectedPoll(contest.contest_id); setView("map"); }}>{contest.ward_name}</button><small className="v2-cell-note">{event?.election_date ? dateText(event.election_date) : "Date unavailable"}</small></td><td>{candidate.candidate_name}</td><td><span className="party-swatch" style={{ background: partyColor(candidate.party_label) }} aria-hidden="true" />{canonicalParty(candidate.party_label)}</td><td>{candidate.votes == null ? "—" : number.format(candidate.votes)}</td><td>{candidate.votes != null && contest.candidate_votes ? percent(candidate.votes / contest.candidate_votes) : "—"}</td><td>{candidate.elected ? <strong aria-label="Elected">✓</strong> : ""}</td><td>{percent(contest.turnout_rate)}</td></tr>);
      }) : level === "country" ? catalog.regions.filter(item => (!sdpOnly && !winningParty) || (item.code === YORKSHIRE && (!sdpOnly || areaSdpCouncils > 0) && (!winningParty || (areaWinnerCounts[winningParty] ?? 0) > 0))).map(item => <tr key={item.code}><td>{item.code === YORKSHIRE ? <button className="link-button" onClick={openRegion}>{item.name}</button> : item.name}</td><td>{item.code === YORKSHIRE ? areaContestCount : "—"}</td><td>{item.code === YORKSHIRE ? leadingParties(areaWinnerCounts).join(" & ") || "—" : "—"}</td><td>{item.code === YORKSHIRE ? regionalActivity.reduce((sum, activity) => sum + activity.sdp_contested_wards.length, 0) : "—"}</td><td>{item.code === YORKSHIRE ? catalog.audience_scope === "leeds_viewers" ? "Leeds released · partial coverage" : "Regional staging · partial coverage" : "Outside this release"}</td></tr>) : visibleAuthorities.map(item => <tr key={item.code}><td>{canOpenAuthority(item.code) ? <button className="link-button" onClick={() => openAuthority(item.code)}>{item.name}</button> : item.name}</td><td>{canOpenAuthority(item.code) ? activityFor(item.code)?.contest_count ?? 0 : "—"}</td><td>{leadingParties(activityFor(item.code)?.winner_counts ?? {}).join(" & ") || "—"}</td><td>{canOpenAuthority(item.code) ? activityFor(item.code)?.sdp_contested_wards.length ?? 0 : "—"}</td><td>{coverageLabel(item.coverage?.[year]?.status)}</td></tr>)}</tbody></table>{level === "authority" && resultsLoading && <p role="status">Loading results…</p>}{level === "authority" && resultError && <p role="alert">Unable to load results: {resultError} Reload to try again.</p>}{level === "authority" && result && visibleContests.length === 0 && <p className="v2-empty">No imported contest matches this selection. This is not confirmation that no election took place.</p>}</div> : <div className="work v2-work">
        <div className="map-pane"><div className="map-heading"><strong>{level === "country" ? "English regions" : level === "region" ? "Yorkshire and Humber councils" : `${authorityArea?.name ?? "Council"} wards`}</strong><span>{layer === "tribes" ? "2021 Census groups · 2025-05 wards" : level === "authority" ? `${year === "latest" ? "Latest imported poll per ward" : "Latest recorded poll in year"} · ${mapEdition} wards` : layer === "winners" ? "Most elected candidates" : "Mean recorded poll turnout"}</span></div>
          {mapGeometry && <GeographyMap geometry={mapGeometry} selected={level === "authority" ? displayedWard : level === "country" ? "" : authority} enabled={code => level === "country" ? code === YORKSHIRE : level === "region" ? canOpenAuthority(code) : true} dimmed={code => (sdpOnly && !sdpFor(code)) || (layer === "winners" && !!winningParty && !electedPartiesFor(code).includes(winningParty))} fill={mapFill} description={mapDescription} onSelect={code => level === "country" ? openRegion() : level === "region" ? openAuthority(code) : openWard(code)} label={mapLabel} />}
          <div className="legend" aria-label="Map legend">{layer === "winners" ? <>{legendOptions.map(party => <span className="legend-item" key={party}><span className="party-swatch" style={{ background: partyColor(party) }} aria-hidden="true" />{party}</span>)}<span className="legend-item"><span className="party-swatch mixed-swatch" />Tied</span><span>Grey: no record or not released</span></> : layer === "tribes" ? <>{profiles[0]?.tribes.map(tribe => <span className="legend-item" key={tribe.id}><span className="party-swatch" style={{ background: tribeColors[tribe.id] }} aria-hidden="true" />{tribe.name}</span>)}<span>Grey: no profile</span></> : <><span>Lower</span><span className="v2-turnout-gradient" aria-hidden="true" /><span>Higher</span><span>Grey: unavailable</span></>}</div>
          <p className="map-note">{layer === "tribes" ? "Dominant Electoral Tribe is an exploratory classification of 2021 Census areas allocated to 2025 Leeds wards. It describes neighbourhood context, not individuals or voting intention." : level === "authority" ? `Ward colours use the latest imported poll on the selected ${mapEdition} ward edition. Choosing a poll on another edition switches the map. Unmapped historical wards remain selectable without a highlight; earlier boundary equivalence is not certified.` : "Council and regional party colours show the party with the most elected candidates in imported polls for this year, not current council control."}{sdpOnly ? " Dim areas have no SDP candidacy in the imported records; that is not proof none stood." : ""}</p>
        </div><aside className="detail" aria-live="polite"><div className="kicker">{level === "country" ? "England / selected releases" : level === "region" ? "Yorkshire and Humber" : authorityArea?.name}</div><h2>{level === "country" ? "England" : level === "region" ? "Yorkshire and Humber" : selectedWardName ?? authorityArea?.name}</h2>
          <div className="detail-tabs" role="group" aria-label="Area information">{(["results", "census", "tribes", "history"] as const).map(item => <button key={item} className={detailTab === item ? "active" : ""} aria-pressed={detailTab === item} onClick={() => setDetailTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
          {detailTab === "results" && <>{level === "country" && <p>Nine English regions are indexed. {catalog.audience_scope === "leeds_viewers" ? "At present, only Leeds City Council results are released; Yorkshire and Humber provides geographic context." : `Yorkshire and Humber is the only region released for this owner test; choose it to explore ${pilotAuthorities.length} councils.`}</p>}{level === "region" && <p>{areaContestCount} imported contests in {year} across {catalog.released_authorities?.length ?? pilotAuthorities.length} released council{(catalog.released_authorities?.length ?? pilotAuthorities.length) === 1 ? "" : "s"}; {pilotAuthorities.length} councils are indexed. {areaSdpCouncils} released council{areaSdpCouncils === 1 ? " has" : "s have"} an imported SDP candidacy.</p>}{level === "authority" && <><p className="sub">{yearLabel} · {year === "latest" ? "Latest imported poll per ward" : coverageLabel(authorityArea?.coverage?.[year]?.status)}</p>{resultsLoading ? <p role="status">Loading results…</p> : resultError ? <p role="alert">Unable to load results: {resultError} Reload to try again.</p> : ward ? currentContest ? <><p className="sub">{currentEvent?.election_date ? dateText(currentEvent.election_date) : "Date unavailable"} · {eventKindLabel(currentEvent?.event_kind)}{currentEvent?.source_url ? <> · <a href={currentEvent.source_url} target="_blank" rel="noreferrer">Poll source</a></> : null}</p>{selectedContests.length > 1 && <label className="field">Poll<select value={currentContest.contest_id} onChange={event => setSelectedPoll(event.target.value)}>{selectedContests.map(contest => <option key={contest.contest_id} value={contest.contest_id}>{result?.events.find(item => item.event_id === contest.event_id)?.election_date ?? contest.contest_id}</option>)}</select></label>}<div className="meta"><div><span>Turnout</span><strong>{percent(currentContest.turnout_rate)}</strong></div><div><span>Seats filled in poll</span><strong>{currentContest.seats_available}{authority === LEEDS ? " of 3" : ""}</strong></div></div><p className="winner-line"><strong>Elected:</strong> {currentCandidates.filter(item => item.elected).map(item => `${item.candidate_name} (${canonicalParty(item.party_label)})`).join("; ") || "Unavailable"}</p></> : <p>No imported contest for this ward {year === "latest" ? "in the release" : `in ${year}`}. Check History for other recorded years.</p> : <p>{activityFor(authority)?.contest_count ?? 0} imported contests in {yearLabel}. Select a ward for its result, or open Table for candidate-level records.</p>}</>}
            {(!authority || result) && (currentContest && ward ? (() => { const votes: Record<string, number> = {}; for (const candidate of currentCandidates) if (candidate.votes != null) { const party = canonicalParty(candidate.party_label); votes[party] = (votes[party] ?? 0) + candidate.votes; } return <PartyBars votes={votes} total={currentContest.candidate_votes} winners={currentCandidates.filter(item => item.elected).map(item => canonicalParty(item.party_label))} multiSeat={currentContest.seats_available > 1} />; })() : <PartyBars votes={areaPartyVotes} total={areaTotalVotes} winners={leadingParties(areaWinnerCounts)} multiSeat={true} compact />)}
            {currentContest?.quality_note && ward && <p className="notice small-notice">{currentContest.quality_note}</p>}{currentContest?.comparability_note && ward && <p className="footnote">{currentContest.comparability_note.replace("code_match_only; historical polygons not certified", "2025 ward code matches; the historical poll boundary has not been certified.")}</p>}</>}
          {detailTab === "census" && (profile ? <><p className="sub">2021 Census · output areas allocated to 2025 Leeds wards</p><div className="census-total"><span>Usual residents</span><strong>{number.format(profile.population)}</strong></div><p className="footnote">{number.format(profile.oa_count)} output areas. Best-fit geography may differ from native ward totals.</p>{["Age", "Households and housing", "Work and education", "Population"].map(group => { const metrics = profile.metrics.filter(item => item.group === group); return metrics.length ? <section className="metric-group" key={group}><h4>{group}</h4>{metrics.map(metric => <div className="metric-row" key={metric.key}><span>{metric.label}</span><strong>{percent(metric.share)}</strong><small>{number.format(metric.count)} of {number.format(metric.denominator)}</small></div>)}</section> : null; })}</> : <p className="sub">{authority === LEEDS ? "Select a Leeds ward to view its 2021 Census profile." : "Ward Census profiles outside Leeds have not yet been prepared for this release."}</p>)}
          {detailTab === "tribes" && (profile ? <><p className="sub">Exploratory K=7 classification of 2021 Census areas; this does not measure voting intention.</p>{profile.tribes.map(item => <div className="result" key={item.id}><div className="result-label"><span><span className="party-swatch" style={{ background: tribeColors[item.id] }} aria-hidden="true" />{item.name}</span><span>{percent(item.share)}</span></div><div className="track"><div className="fill" style={{ width: `${item.share * 100}%`, background: tribeColors[item.id] }} /></div></div>)}<p className="footnote">Shares are weighted by 2021 Census residents in each output area.</p></> : <p className="sub">{authority === LEEDS ? "Select a Leeds ward to view its Electoral Tribes profile." : "Electoral Tribes profiles outside Leeds have not yet been prepared for this release."}</p>)}
          {detailTab === "history" && (ward ? historyError ? <p role="alert">Unable to load recorded history: {historyError} Reload to try again.</p> : selectedHistory.length ? <ol className="history-list">{selectedHistory.map((item, index) => <li key={`${item.date}-${index}`}><strong>{item.date ? dateText(item.date) : "Date unavailable"}</strong><span>{eventKindLabel("event_kind" in item ? item.event_kind : item.kind)} · {item.status === "included" || item.status === "checked_published" || item.status === "secondary_source_staged" || item.status === "council_source_staged" ? "Recorded" : item.status}</span>{"winners" in item && item.winners ? <small>{Array.isArray(item.winners) ? item.winners.map(winner => `${winner.candidate_name} (${winner.party_label})`).join("; ") : item.winners}</small> : null}{"reason" in item && item.reason ? <small>{item.reason}</small> : null}</li>)}</ol> : <p className="sub">{authority !== LEEDS && historyState?.authority !== authority ? "Loading recorded history…" : "No imported poll history for this ward. This does not prove there were no elections."}</p> : <><p className="sub">Select a ward for recorded poll history. Council-year status is shown below.</p>{authority ? <ul className="v2-year-list">{[...catalog.years].reverse().map(value => <li key={value}><strong>{value}</strong><span>{coverageLabel(authorityArea?.coverage?.[String(value)]?.status)}</span></li>)}</ul> : <p>Choose a council to see its recorded coverage by year.</p>}</>)}
        </aside></div>}
      <div className="under"><span>{yearLabel} · {areaContestCount} imported contests in this scope{sourceUrl && level === "authority" ? <> · <a href={sourceUrl} target="_blank" rel="noreferrer">Council-year source</a></> : null}</span><span>Geography: ONS {level === "authority" ? mapEdition : "2025/2026"} · {catalog.audience_scope === "leeds_viewers" ? "Leeds results: audited Pulse v0.6.0; other councils are not released" : <>non-Leeds ordinary results: <a href="https://electionresults.uk/councils/data" target="_blank" rel="noreferrer">attributed secondary compilation</a>; selected by-elections: council returns</>}</span></div>
    </>}
  </>;
}
