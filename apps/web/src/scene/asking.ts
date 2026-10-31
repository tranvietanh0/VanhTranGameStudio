import type { LeadQuestion, Team } from "@studio/shared";

/** Leads that currently want the CEO: a pending question, or herdr reports the pane blocked. */
export interface AskingInfo {
  /** Newest pending question of the team, or null when only the status is blocked. */
  questionId: string | null;
  /** Short preview for the speech bubble (may be empty). */
  preview: string;
}

export const BUBBLE_PREFIX = "Sếp ơi, cho em hỏi…";
export const PREVIEW_CHARS = 40;

export function truncate(text: string, max = PREVIEW_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).trimEnd()}…`;
}

function lastLine(screenTail: string): string {
  const lines = screenTail.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

function previewOf(q: LeadQuestion): string {
  const first = q.questions[0]?.question;
  return truncate(first && first.trim() ? first : lastLine(q.screenTail));
}

export function askingByTeam(teams: readonly Team[], questions: Record<string, LeadQuestion>): Map<string, AskingInfo> {
  const newest = new Map<string, LeadQuestion>();
  for (const q of Object.values(questions)) {
    const prev = newest.get(q.teamId);
    if (!prev || q.createdAt > prev.createdAt) newest.set(q.teamId, q);
  }
  const out = new Map<string, AskingInfo>();
  for (const team of teams) {
    const q = newest.get(team.id);
    if (q) out.set(team.id, { questionId: q.id, preview: previewOf(q) });
    else if (team.status === "blocked") out.set(team.id, { questionId: null, preview: "" });
  }
  return out;
}
