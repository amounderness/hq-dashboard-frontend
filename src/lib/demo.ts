// Fictional records for testing the hosted UI without releasing the Leeds package.
// None of the names, shapes, counts or votes in this module represent an election.
const wards = [
  { ward_code: "DEMO-001", ward_name: "Example North" },
  { ward_code: "DEMO-002", ward_name: "Example Centre" },
  { ward_code: "DEMO-003", ward_name: "Example South" },
];

const shapes = [
  [[-1.64, 53.82], [-1.58, 53.84], [-1.54, 53.81], [-1.59, 53.79], [-1.64, 53.82]],
  [[-1.59, 53.79], [-1.54, 53.81], [-1.51, 53.78], [-1.56, 53.76], [-1.59, 53.79]],
  [[-1.59, 53.79], [-1.56, 53.76], [-1.61, 53.73], [-1.65, 53.76], [-1.59, 53.79]],
];

const geo = {
  type: "FeatureCollection",
  features: wards.map((ward, i) => ({
    type: "Feature",
    id: ward.ward_code,
    properties: { ward_code: ward.ward_code, ward_name: ward.ward_name },
    geometry: { type: "Polygon", coordinates: [shapes[i]] },
  })),
};

const manifest = {
  package_id: "synthetic-owner-preview-v0.1.0",
  assembled_on: "2026-09-25",
  candidate_records: 48,
  contests: 16,
  wards: wards.length,
  demo: true,
  publication_allowed: true,
  release_limits: [
    "All names, boundaries, turnout figures and votes in this preview are fabricated.",
    "This preview tests navigation and display only; it cannot support electoral analysis or campaign decisions.",
    "The real Leeds package remains local and has not passed its release checks.",
  ],
};

function yearData(year: string) {
  const selected = year === "2025" ? wards.slice(1, 2) : wards;
  const date = year === "2025" ? "2025-06-12" : `${year}-05-07`;
  const events = [{ event_id: `DEMO-${year}`, election_date: date, event_kind: year === "2025" ? "by_election" : "council_election", status: "synthetic" }];
  const contests = selected.map((ward, i) => {
    const a = 390 + Number(year) % 11 * 8 + i * 17;
    const b = 320 + i * 21;
    const c = 190 + i * 9;
    return { contest_id: `${year}-${ward.ward_code}`, event_id: events[0].event_id, ward_code: ward.ward_code, seats_available: 1, turnout_rate: .32 + i * .065, all_candidate_votes: a + b + c, party_labels_contested: ["Example Party A", "Example Party B", "Example Party C"] };
  });
  const candidates = contests.flatMap(contest => ["A", "B", "C"].map((letter, i) => ({ contest_id: contest.contest_id, party_label: `Example Party ${letter}`, candidate_name: `Fictional Candidate ${letter}`, votes: i === 0 ? contest.all_candidate_votes - (320 + 190) : i === 1 ? 320 : 190, elected: i === 0 })));
  const parties = candidates.map(candidate => {
    const contest = contests.find(c => c.contest_id === candidate.contest_id)!;
    return { contest_id: candidate.contest_id, party_label: candidate.party_label, share_of_candidate_votes: candidate.votes / contest.all_candidate_votes, candidate_votes: candidate.votes, seats_won: candidate.elected ? 1 : 0 };
  });
  return { events, contests, candidates, parties };
}

export function getDemoPackage(kind: "manifest" | "wards" | "geo" | "year", year?: string) {
  if (kind === "manifest") return manifest;
  if (kind === "wards") return wards;
  if (kind === "geo") return geo;
  if (!year || !/^(202[1-6])$/.test(year)) throw new Error("Unsupported demo year.");
  return yearData(year);
}
