import type { Contest, Party, YearData } from "./pulse-types";

const knownParties: Record<string, string> = {
  "Conservative": "#2473b5",
  "Labour": "#c8102e",
  "Liberal Democrat": "#e49a20",
  "Green": "#269263",
  "Reform UK": "#0e9db5",
  "SDP": "#d25469",
  "Morley Borough Independents": "#7655a4",
  "Garforth & Swillington Independents Party": "#81703d",
  "Yorkshire Party": "#aa753b",
  "Independent": "#69798b",
  "TUSC": "#ac4d78",
  "UKIP": "#7057a7",
};
const otherColors = ["#6e7892", "#a57447", "#4a8792", "#a05b69", "#6c8e54", "#976e9c"];
export const tribeColors = ["#7c64bd", "#8b764e", "#377b9e", "#ba6c91", "#79a44c", "#45a590", "#bc7062"];

export function partyColor(party: string): string {
  if (knownParties[party]) return knownParties[party];
  let hash = 0;
  for (const character of party) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return otherColors[hash % otherColors.length];
}

export function winningParties(contest: Contest | undefined, data: YearData): string[] {
  if (!contest) return [];
  return data.parties.filter((party: Party) => party.contest_id === contest.contest_id && party.seats_won > 0)
    .map(party => party.party_label).sort();
}
