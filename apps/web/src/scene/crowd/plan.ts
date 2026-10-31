import type { Team } from "@studio/shared";
import { truncate } from "../asking";
import { CEO_VARIANT, hashString, LEAD_VARIANTS, memberStyle, pick } from "../palette";
import { prettyAgentType, type SeatAssignment } from "../members";

export type ActorRole = "ceo" | "lead" | "member";

/** What should be in the office right now, derived from the store (pure, unit-tested). */
export interface ActorSpec {
  id: string;
  role: ActorRole;
  variant: string;
  teamId: string | null;
  slot: number;
  /** 0 = lead seat, 1..5 = member seats. */
  seat: number;
  /** Nameplate text for members. */
  title: string;
  subtitle: string;
  accent: string;
}

export const DESCRIPTION_CHARS = 28;

export function leadId(teamId: string): string {
  return `lead:${teamId}`;
}

export function memberActorId(teamId: string, memberId: string): string {
  return `m:${teamId}:${memberId}`;
}

export function planCrowd(teams: readonly Team[], seats: ReadonlyMap<string, SeatAssignment>): ActorSpec[] {
  const out: ActorSpec[] = [
    { id: "ceo", role: "ceo", variant: CEO_VARIANT, teamId: null, slot: -1, seat: -1, title: "", subtitle: "", accent: "" },
  ];
  for (const team of teams) {
    out.push({
      id: leadId(team.id), role: "lead", variant: pick(LEAD_VARIANTS, hashString(team.id)), teamId: team.id,
      slot: team.slot, seat: 0, title: team.projectName, subtitle: "", accent: "",
    });
    const assigned = seats.get(team.id)?.seats;
    if (!assigned) continue;
    for (const member of team.members ?? []) {
      const seat = assigned.get(member.id);
      if (seat === undefined) continue;
      const style = memberStyle(member.agentType);
      out.push({
        id: memberActorId(team.id, member.id), role: "member", variant: style.variant, teamId: team.id,
        slot: team.slot, seat, title: prettyAgentType(member.agentType),
        subtitle: truncate(member.description, DESCRIPTION_CHARS), accent: style.accent,
      });
    }
  }
  return out;
}
