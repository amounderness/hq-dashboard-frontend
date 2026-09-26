"use client";

import { useMemo, useState } from "react";
import type { SdpResult, SdpResultsData } from "@/lib/pulse-insight-types";

const number = new Intl.NumberFormat("en-GB");
const pct = (value: number | null | undefined) => value == null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;

export default function SdpResultsPage({ data, onOpenWard }: { data: SdpResultsData; onOpenWard: (row: SdpResult) => void }) {
  const [year, setYear] = useState("all");
  const [winner, setWinner] = useState("all");
  const [opponent, setOpponent] = useState("all");
  const [electedOnly, setElectedOnly] = useState(false);
  const [wardSearch, setWardSearch] = useState("");
  const years = [...new Set(data.rows.map(row => row.year))].sort();
  const winners = [...new Set(data.rows.flatMap(row => row.winning_parties))].sort();
  const opponents = [...new Set(data.rows.flatMap(row => row.parties_contested).filter(party => party !== "SDP"))].sort();
  const filtered = useMemo(() => data.rows.filter(row =>
    (year === "all" || row.year === Number(year)) &&
    (winner === "all" || row.winning_parties.includes(winner)) &&
    (opponent === "all" || row.parties_contested.includes(opponent)) &&
    (!electedOnly || row.sdp_seats_won > 0) &&
    row.ward_name.toLowerCase().includes(wardSearch.toLowerCase().trim())
  ).sort((a, b) => b.sdp_share - a.sdp_share), [data.rows, year, winner, opponent, electedOnly, wardSearch]);
  const byYear = years.map(item => ({ year: item, rows: filtered.filter(row => row.year === item) })).filter(item => item.rows.length);
  const votes = filtered.reduce((sum, row) => sum + row.sdp_votes, 0);
  const seats = filtered.reduce((sum, row) => sum + row.sdp_seats_won, 0);
  const mean = filtered.length ? filtered.reduce((sum, row) => sum + row.sdp_share, 0) / filtered.length : null;
  return <><div className="eyebrow">SDP / recorded Leeds results</div><h1>SDP Results</h1>
    <p className="muted">Explore where SDP candidates stood, their recorded votes and shares, and the parties present in each ward poll.</p>
    <div className="notice"><strong>How to read this.</strong> {data.definition} The party chose where to stand, so these comparisons do not measure what caused a result or predict future support.</div>
    <div className="toolbar sdp-toolbar"><label className="field">Election year<select value={year} onChange={event => setYear(event.target.value)}><option value="all">All years</option>{years.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="field">Winning party<select value={winner} onChange={event => setWinner(event.target.value)}><option value="all">All winners</option>{winners.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="field">Also contested by<select value={opponent} onChange={event => setOpponent(event.target.value)}><option value="all">Any party</option>{opponents.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="field search">Ward name<input type="search" placeholder="Filter wards…" value={wardSearch} onChange={event => setWardSearch(event.target.value)} /></label>
      <label className="contested-filter"><input type="checkbox" checked={electedOnly} onChange={event => setElectedOnly(event.target.checked)} />SDP elected</label>
    </div>
    <div className="stats sdp-stats"><div className="card stat">Ward polls<strong>{filtered.length}</strong><span className="muted">With an SDP candidate</span></div>
      <div className="card stat">SDP votes<strong>{number.format(votes)}</strong><span className="muted">Across these polls</span></div>
      <div className="card stat">Average share<strong>{pct(mean)}</strong><span className="muted">Unweighted across ward polls</span></div>
      <div className="card stat">Seats won<strong>{seats}</strong><span className="muted">Within these results</span></div></div>
    <div className="card sdp-year-chart"><h2>Average SDP share by election year</h2>{byYear.length ? byYear.map(item => {
      const average = item.rows.reduce((sum, row) => sum + row.sdp_share, 0) / item.rows.length;
      return <div className="year-bar" key={item.year}><span>{item.year}</span><div className="track"><div className="fill" style={{ width: `${Math.min(average * 200, 100)}%`, background: "#ad519b" }} /></div><strong>{pct(average)}</strong><small>{item.rows.length} ward polls</small></div>;
    }) : <p>No results match these filters.</p>}<p className="footnote">Bars use a 0–50% scale. Different wards and candidate slates are present each year, so the bars are descriptive, not like-for-like trend estimates.</p></div>
    <div className="table-wrap"><table className="results-table"><thead><tr><th>Ward</th><th>Year</th><th>SDP candidates</th><th>SDP votes</th><th>Share</th><th>Turnout</th><th>Elected party</th></tr></thead><tbody>
      {filtered.map(row => <tr key={row.contest_id}><td><button className="link-button" onClick={() => onOpenWard(row)}>{row.ward_name}</button></td><td>{row.year}</td><td>{row.sdp_candidates.map(item => item.name).join("; ")}{row.sdp_seats_won ? " · elected" : ""}</td><td>{number.format(row.sdp_votes)}</td><td>{pct(row.sdp_share)}</td><td>{pct(row.turnout_rate)}</td><td>{row.winning_parties.join(" and ")}</td></tr>)}
      {!filtered.length && <tr><td colSpan={7}>No recorded SDP results match these filters.</td></tr>}
    </tbody></table></div>
    <p className="footnote">{data.scope} {data.rows.some(row => row.date === "2024-10-10" && row.ward_code === "E05012648") ? "The October 2024 Farnley & Wortley row uses a labelled secondary local report because the council declaration is blank." : "The October 2024 Farnley & Wortley result is excluded because its council declaration is blank."} Missing sources are not treated as zero SDP votes. Ward Tribe profiles can be explored separately; association with party results has not been established as a voter-level relationship.</p>
  </>;
}
