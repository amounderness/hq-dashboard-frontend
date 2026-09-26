"use client";

import { useMemo, useState } from "react";
import { downloadCsv } from "@/lib/report-export";
import type { CompositionData, SdpResultsData } from "@/lib/pulse-insight-types";
import type { Ward, WardHistory, WardProfile, YearData } from "@/lib/pulse-types";
import { winningParties } from "@/lib/pulse-colors";

type Report = "ward" | "composition" | "sdp";
const pct = (value: number | null | undefined) => value == null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;
const number = new Intl.NumberFormat("en-GB");

export default function ReportsPage({ packageId, year, setYear, ward, setWard, wards, data, profiles, history, composition, sdp }: {
  packageId: string; year: string; setYear: (value: string) => void; ward: string; setWard: (value: string) => void;
  wards: Ward[]; data: YearData | null; profiles: WardProfile[]; history: WardHistory; composition: CompositionData | null; sdp: SdpResultsData | null;
}) {
  const [report, setReport] = useState<Report>("ward");
  const [sdpYear, setSdpYear] = useState("all");
  const wardRow = wards.find(item => item.ward_code === ward);
  const contest = data?.contests.find(item => item.ward_code === ward);
  const event = data?.events.find(item => item.event_id === contest?.event_id);
  const candidates = useMemo(() => data?.candidates.filter(item => item.contest_id === contest?.contest_id).sort((a, b) => b.votes - a.votes) ?? [], [data, contest]);
  const profile = profiles.find(item => item.ward_code === ward);
  const rejectedEvents = history[ward]?.filter(item => item.status === "source_rejected") ?? [];
  const snapshot = composition?.snapshots.find(item => item.key === year);
  const sdpRows = sdp?.rows.filter(row => sdpYear === "all" || row.year === Number(sdpYear)) ?? [];
  const generatedAt = new Date().toISOString();
  const metadata = [
    ["Switchboard report", report === "ward" ? "Ward result" : report === "composition" ? "Council composition" : "SDP recorded results"],
    ["Package", packageId], ["Generated at UTC", generatedAt], ["Election view", report === "sdp" ? sdpYear : year],
    ["Interpretation", "Recorded public data; latest ward result is not a current-seat record or future forecast"],
    ["Leeds source limits", "Farnley & Wortley October 2024 by-election has a rejected blank declaration; 15 historical candidate votes differ between council archive and Handbook; by-election register is not certified complete"], [],
  ];
  function exportCurrent() {
    if (report === "ward") {
      if (!contest || !event) return;
      downloadCsv(`switchboard-ward-${ward}-${year}.csv`, [...metadata, ["Ward", wardRow?.ward_name], ["Poll date", event.election_date], ["Turnout", pct(contest.turnout_rate)], ["Seats", contest.seats_available], ["Elected party", winningParties(contest, data!).join(" and ")], ["Quality note", contest.data_quality_note ?? ""], ["Rejected source events in this ward", rejectedEvents.map(item => `${item.date}: ${item.reason ?? "result source rejected"}`).join("; ")], [], ["Candidate", "Party", "Votes", "Elected"], ...candidates.map(item => [item.candidate_name, item.party_label, item.votes, item.elected ? "Yes" : "No"])]);
    } else if (report === "composition") {
      if (!snapshot) return;
      downloadCsv(`switchboard-composition-${year}.csv`, [...metadata, ["Snapshot date", snapshot.as_of], ["Source", snapshot.source_url], ["Total positions", composition?.seat_total], [], ["Party", "Councillors or vacancies"], ...Object.entries(snapshot.seats).sort((a, b) => b[1] - a[1]).map(([party, seats]) => [party, seats])]);
    } else {
      downloadCsv(`switchboard-sdp-results-${sdpYear}.csv`, [...metadata, ["Definition", sdp?.definition], ["Coverage", sdp?.scope], [], ["Ward", "Poll date", "Year", "Event", "SDP candidate votes", "SDP candidate-vote share", "SDP seats won", "Turnout", "Winning parties", "SDP candidates", "Quality note"], ...sdpRows.map(row => [row.ward_name, row.date, row.year, row.event_kind, row.sdp_votes, pct(row.sdp_share), row.sdp_seats_won, pct(row.turnout_rate), row.winning_parties.join(" and "), row.sdp_candidates.map(item => item.name).join("; "), row.data_quality_note ?? ""])]);
    }
  }
  const canExport = report === "ward" ? !!contest && !!event : report === "composition" ? !!snapshot : !!sdp && sdpRows.length > 0;
  return <div className="reports-page"><div className="eyebrow">Switchboard / published package</div><h1>Reports &amp; exports</h1>
    <p className="muted research-intro">Create a ward result brief, a dated council composition summary, or a table of recorded SDP results. CSV downloads and print views use the approved package shown below.</p>
    <div className="toolbar report-toolbar"><label className="field">Report<select value={report} onChange={event => setReport(event.target.value as Report)}><option value="ward">Ward result brief</option><option value="composition">Council composition</option><option value="sdp">SDP results</option></select></label>
      {report !== "sdp" && <label className="field">Election view<select value={year} onChange={event => setYear(event.target.value)}><option value="latest">Latest recorded</option>{[2026, 2025, 2024, 2023, 2022, 2021].map(item => <option key={item} value={item}>{item}</option>)}</select></label>}
      {report === "ward" && <label className="field">Ward<select value={ward} onChange={event => setWard(event.target.value)}>{[...wards].sort((a, b) => a.ward_name.localeCompare(b.ward_name)).map(item => <option key={item.ward_code} value={item.ward_code}>{item.ward_name}</option>)}</select></label>}
      {report === "sdp" && <label className="field">Election year<select value={sdpYear} onChange={event => setSdpYear(event.target.value)}><option value="all">All recorded years</option>{[2026, 2025, 2024, 2023, 2022, 2021].map(item => <option key={item} value={item}>{item}</option>)}</select></label>}
      <button className="button" disabled={!canExport} onClick={exportCurrent}>Download CSV</button><button className="button secondary-button" disabled={!canExport} onClick={() => window.print()}>Print / save PDF</button>
    </div>
    <div className="card report-sheet"><div className="report-head"><div><span className="eyebrow">Leeds pilot · {packageId}</span><h2>{report === "ward" ? `${wardRow?.ward_name ?? "Ward"} · result brief` : report === "composition" ? "Leeds council composition" : "SDP recorded results"}</h2></div><span className="muted">{report === "sdp" ? sdpYear === "all" ? "2021–2026" : sdpYear : year === "latest" ? "Latest recorded" : year}</span></div>
      {report === "ward" && (contest && event ? <><p><strong>Poll:</strong> {event.election_date} · {event.event_kind === "by_election" ? "by-election" : "council election"}</p><div className="stats"><div className="stat">Turnout<strong>{pct(contest.turnout_rate)}</strong></div><div className="stat">Seats elected<strong>{contest.seats_available}</strong></div><div className="stat">Winning party<strong>{winningParties(contest, data!).join(" and ") || "Unavailable"}</strong></div></div><h3>Candidate votes</h3><div className="table-wrap"><table className="results-table"><thead><tr><th>Candidate</th><th>Party</th><th>Votes</th><th>Elected</th></tr></thead><tbody>{candidates.map(item => <tr key={`${item.candidate_name}-${item.party_label}`}><td>{item.candidate_name}</td><td>{item.party_label}</td><td>{number.format(item.votes)}</td><td>{item.elected ? "Yes" : "No"}</td></tr>)}</tbody></table></div>{profile && <p className="footnote">2021 Census residents on best-fit 2025 wards: {number.format(profile.population)}. Electoral Tribes are exploratory neighbourhood groups, not measured voter types.</p>}{contest.data_quality_note && <p className="notice">{contest.data_quality_note}</p>}{rejectedEvents.map(item => <p className="notice" key={item.date}><strong>Rejected source event ({item.date}):</strong> {item.reason ?? "A result source was rejected; its votes are not included."}</p>)}</> : <p className="notice">No imported result for this ward in the selected view. Missing or rejected records are not treated as zero votes.</p>)}
      {report === "composition" && (snapshot ? <><p><strong>Snapshot as of:</strong> {snapshot.as_of}. This is a dated council-published composition, separate from the ward winners in the Explorer.</p><div className="table-wrap"><table className="results-table"><thead><tr><th>Party or vacancy</th><th>Councillors / positions</th></tr></thead><tbody>{Object.entries(snapshot.seats).sort((a, b) => b[1] - a[1]).map(([party, seats]) => <tr key={party}><td>{party}</td><td>{seats}</td></tr>)}</tbody></table></div><p>Positions: {composition?.seat_total}. <a href={snapshot.source_url} target="_blank" rel="noreferrer">Council source</a>.</p></> : <p className="notice">No verified full-council composition snapshot is available for this election view.</p>)}
      {report === "sdp" && <><p>{sdp?.definition ?? "Loading SDP results…"}</p><p>{sdpRows.length} recorded ward polls. Candidate-vote share is not a share of voters when multiple seats were contested.</p><div className="table-wrap"><table className="results-table"><thead><tr><th>Ward</th><th>Poll</th><th>Votes</th><th>Share</th><th>Seats</th><th>Winning parties</th></tr></thead><tbody>{sdpRows.map(row => <tr key={row.contest_id}><td>{row.ward_name}</td><td>{row.date}</td><td>{number.format(row.sdp_votes)}</td><td>{pct(row.sdp_share)}</td><td>{row.sdp_seats_won}</td><td>{row.winning_parties.join(" and ")}</td></tr>)}</tbody></table></div><p className="footnote">{sdp?.scope} Wards and candidates varied by year; these figures are descriptive, not a like-for-like trend or a forecast.</p></>}
      <footer className="report-footer">Source package: {packageId}. Generated {generatedAt}. Latest recorded ward polls are not a current-seat composition or future prediction. The Farnley &amp; Wortley 2024 by-election remains rejected; 15 candidate votes have disputed source values; by-election coverage is not certified complete. See Data &amp; sources for limits and attribution.</footer>
    </div>
  </div>;
}
