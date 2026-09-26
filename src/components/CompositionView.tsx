"use client";

import { partyColor } from "@/lib/pulse-colors";
import { previousComposition, seatDelta, seatDeltaLabel } from "@/lib/composition-change";
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
  const previous = previousComposition(data, snapshot);
  const groups = [...new Set([...Object.keys(snapshot.seats), ...Object.keys(previous?.seats ?? {})])]
    .map(party => [party, snapshot.seats[party] ?? 0] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const seats = groups.flatMap(([party, count]) => Array.from({ length: count }, () => party));
  const summary = groups.map(([party, count]) => `${party} ${count}`).join(", ");
  return <div className="composition-view">
    <div className="composition-heading"><div><h2>Leeds City Council composition</h2><p>{snapshot.label}</p></div><div className="composition-total"><strong>{data.seat_total}</strong><span>seats</span></div></div>
    <p className="composition-note"><strong>Information correct as recorded on {snapshot.as_of}.</strong> {year === "latest" ? "This is the latest council snapshot saved in Switchboard; it may have changed since." : "This is the council count immediately after that election, not the composition today."}</p>
    <p className="footnote">{previous ? <>Seat change compares this snapshot with <a href={previous.source_url} target="_blank" rel="noreferrer">{previous.as_of}</a>. It covers every election, by-election, vacancy and party switch between those dates; it is not the net change from the selected election alone.{year === "2026" ? " The prior saved snapshot is from May 2024, so this comparison spans two years." : ""}</> : "No earlier checked composition snapshot is included, so seat change is unavailable for this view."}</p>
    {year === "latest" && <p className="notice">The May 2026 council release recorded 48 Labour and 11 Green councillors. This saved September snapshot records 46 Labour, 10 Green, three independents and one vacancy. Reported intervening events include two changes to independent status and the Calverley &amp; Farsley vacancy; see <a href="https://en.wikipedia.org/wiki/2026_Leeds_City_Council_election#Changes_between_2026_and_2027" target="_blank" rel="noreferrer">the secondary event timeline</a> and <a href="https://www.leeds.gov.uk/elections/leeds-city-council-elections" target="_blank" rel="noreferrer">the council vacancy notice</a>.</p>}
    <div className="composition-layout"><svg className="hemicycle" viewBox="0 0 440 235" role="img" aria-label={`Leeds council seats: ${summary}`}>
      {positions.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="6.6" fill={seatColor(seats[index])} stroke="#fff" strokeWidth="1.4"><title>{seats[index]} seat</title></circle>)}
    </svg><div className="composition-table-wrap"><table className="results-table composition-table"><thead><tr><th>Party or status</th><th>Seats</th><th>Change since prior snapshot</th></tr></thead><tbody>
      {groups.map(([party, count]) => <tr key={party}><td><span className="composition-label"><span className="party-swatch" style={{ background: seatColor(party) }} aria-hidden="true" />{party}</span></td><td>{count}</td><td>{seatDeltaLabel(seatDelta(snapshot, previous, party))}</td></tr>)}
      <tr className="composition-sum"><td>Total positions</td><td>{data.seat_total}</td><td>{previous ? "0 · no change" : "—"}</td></tr>
    </tbody></table></div></div>
    <p className="footnote">Source: <a href={snapshot.source_url} target="_blank" rel="noreferrer">Leeds City Council composition, {snapshot.as_of}</a>. Figures are a dated snapshot of councillors and vacancies, not a sum of the winners in the selected ward poll.</p>
  </div>;
}
