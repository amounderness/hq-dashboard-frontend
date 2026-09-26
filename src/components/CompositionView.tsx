"use client";

import { partyColor } from "@/lib/pulse-colors";
import type { CompositionData } from "@/lib/pulse-insight-types";

const ringSizes = [13, 19, 27, 40];
const radii = [82, 114, 146, 178];
const positions = ringSizes.flatMap((count, ring) => Array.from({ length: count }, (_, index) => {
  const angle = Math.PI - (index + .5) * Math.PI / count;
  return { angle, x: 220 + Math.cos(angle) * radii[ring], y: 220 - Math.sin(angle) * radii[ring] };
})).sort((a, b) => b.angle - a.angle);

function seatColor(party: string) {
  return party === "Vacancy" ? "#d9e0e6" : partyColor(party);
}

export default function CompositionView({ data, year }: { data: CompositionData; year: string }) {
  const snapshot = data.snapshots.find(item => item.key === year);
  if (!snapshot) return <div className="card composition-missing"><h2>No verified 2025 composition snapshot</h2>
    <p>Leeds held a Morley South by-election in 2025, but the release does not contain a checked full-council composition for that date. The 2024 post-election count is available in the 2024 view; it should not be read as the 2025 count.</p></div>;
  const groups = Object.entries(snapshot.seats).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const seats = groups.flatMap(([party, count]) => Array.from({ length: count }, () => party));
  const summary = groups.map(([party, count]) => `${party} ${count}`).join(", ");
  return <div className="composition-view">
    <div className="composition-heading"><div><h2>Leeds City Council composition</h2><p>{snapshot.label}</p></div><div className="composition-total"><strong>{data.seat_total}</strong><span>seats</span></div></div>
    <p className="composition-note">{year === "latest" ? "Council-published page captured on 26 September 2026. This is the latest available snapshot in Switchboard, and may have changed since." : "Official council count immediately after this election. It does not describe every subsequent vacancy, by-election or party change."}</p>
    <div className="composition-layout"><svg className="hemicycle" viewBox="0 0 440 235" role="img" aria-label={`Leeds council seats: ${summary}`}>
      {positions.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="6.6" fill={seatColor(seats[index])} stroke="#fff" strokeWidth="1.4"><title>{seats[index]} seat</title></circle>)}
    </svg><div className="composition-table-wrap"><table className="results-table composition-table"><thead><tr><th>Party or status</th><th>Seats</th></tr></thead><tbody>
      {groups.map(([party, count]) => <tr key={party}><td><span className="composition-label"><span className="party-swatch" style={{ background: seatColor(party) }} aria-hidden="true" />{party}</span></td><td>{count}</td></tr>)}
      <tr className="composition-sum"><td>Total seats</td><td>{data.seat_total}</td></tr>
    </tbody></table></div></div>
    <p className="footnote">Source: <a href={snapshot.source_url} target="_blank" rel="noreferrer">Leeds City Council composition, {snapshot.as_of}</a>. Figures are a dated snapshot of councillors and vacancies, not a sum of the winners in the selected ward poll.</p>
  </div>;
}
