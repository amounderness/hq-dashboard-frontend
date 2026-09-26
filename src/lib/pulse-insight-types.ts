export type CompositionSnapshot = {
  key: string;
  as_of: string;
  label: string;
  source_kind: string;
  source_url: string;
  seats: Record<string, number>;
};
export type CompositionData = {
  authority: string;
  seat_total: number;
  retrieved_on: string;
  snapshots: CompositionSnapshot[];
};

export type TribeResearch = {
  model: string;
  year: number;
  basis: string;
  selection_note: string;
  ward_interpretation: string;
  political_limit: string;
  source_file_sha256: string;
  clusters: { id: number; name: string; description: string; confidence: string; higher_features: string[] }[];
};

export type SdpResult = {
  year: number;
  date: string;
  event_kind: string;
  ward_code: string;
  ward_name: string;
  contest_id: string;
  seats_available: number;
  turnout_rate: number | null;
  sdp_votes: number;
  sdp_share: number;
  sdp_seats_won: number;
  sdp_candidates: { name: string; votes: number; elected: boolean }[];
  winning_parties: string[];
  parties_contested: string[];
  dominant_tribe_id: number;
  data_quality_note?: string;
};
export type SdpResultsData = { definition: string; scope: string; rows: SdpResult[] };
