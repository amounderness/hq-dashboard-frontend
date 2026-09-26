import type { CompositionData, CompositionSnapshot } from "@/lib/pulse-insight-types";

export function previousComposition(data: CompositionData, snapshot: CompositionSnapshot) {
  const index = data.snapshots.findIndex(item => item.key === snapshot.key);
  return index > 0 ? data.snapshots[index - 1] : null;
}

export function seatDelta(current: CompositionSnapshot, previous: CompositionSnapshot | null, party: string) {
  return previous ? (current.seats[party] ?? 0) - (previous.seats[party] ?? 0) : null;
}

export function seatDeltaLabel(delta: number | null) {
  return delta == null ? "—" : delta === 0 ? "0 · no change" : delta > 0 ? `+${delta}` : String(delta);
}
