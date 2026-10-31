import type { TeamMember } from "@studio/shared";
import { MAX_MEMBER_SEATS } from "./layout";

/** Member id → seat index (1..MAX_MEMBER_SEATS) inside its team pod. */
export type SeatMap = ReadonlyMap<string, number>;

export interface SeatAssignment {
  seats: Map<string, number>;
  /** Members that did not get a seat (shown as a "+N" badge). */
  overflow: number;
}

/**
 * Stable seat assignment: a member keeps the seat it already has; newcomers (oldest first) take
 * the lowest free seat. Members beyond the pod's capacity only count towards `overflow`, and get a
 * seat once one frees up.
 */
export function assignSeats(prev: SeatMap, members: readonly TeamMember[]): SeatAssignment {
  const seats = new Map<string, number>();
  const taken = new Set<number>();
  for (const m of members) {
    const seat = prev.get(m.id);
    if (seat !== undefined && seat >= 1 && seat <= MAX_MEMBER_SEATS && !taken.has(seat)) {
      seats.set(m.id, seat);
      taken.add(seat);
    }
  }
  const waiting = members
    .filter((m) => !seats.has(m.id))
    .sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let overflow = 0;
  let next = 1;
  for (const m of waiting) {
    while (next <= MAX_MEMBER_SEATS && taken.has(next)) next++;
    if (next > MAX_MEMBER_SEATS) {
      overflow++;
      continue;
    }
    seats.set(m.id, next);
    taken.add(next);
  }
  return { seats, overflow };
}

/** "general-purpose" → "General purpose"; keeps short agent types readable on a nameplate. */
export function prettyAgentType(agentType: string): string {
  const clean = agentType.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "Agent";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Seat assignment for every team, keeping each member's previous seat (see assignSeats). */
export function assignAllSeats(
  prev: ReadonlyMap<string, SeatAssignment>,
  teams: ReadonlyArray<{ id: string; members?: readonly TeamMember[] }>,
): Map<string, SeatAssignment> {
  const out = new Map<string, SeatAssignment>();
  for (const team of teams) out.set(team.id, assignSeats(prev.get(team.id)?.seats ?? new Map(), team.members ?? []));
  return out;
}
