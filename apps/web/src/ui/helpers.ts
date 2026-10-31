import type { AgentStatus, AnswerPayload, AskQuestion, LeadQuestion, Team, TerminalKey } from "@studio/shared";
import type { ConnectionState } from "../store/officeStore";

export const STATUS_LABEL: Record<AgentStatus, string> = {
  working: "Đang làm",
  idle: "Rảnh",
  blocked: "Cần sếp",
  done: "Xong",
  unknown: "Không rõ",
};

export const CONNECTION_LABEL: Record<ConnectionState, string> = {
  idle: "Chưa kết nối",
  connecting: "Đang kết nối…",
  open: "Đã kết nối",
  reconnecting: "Mất kết nối, đang thử lại",
  closed: "Đã ngắt kết nối",
  mock: "Chế độ giả lập",
};

export function statusLabel(status: AgentStatus): string {
  return STATUS_LABEL[status] ?? STATUS_LABEL.unknown;
}

/** Stable hue (0-359) from a team id. */
export function teamHue(teamId: string): number {
  let h = 0;
  for (let i = 0; i < teamId.length; i += 1) h = (h * 31 + teamId.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function teamColor(teamId: string): string {
  return `hsl(${teamHue(teamId)} 62% 72%)`;
}

/** Up to two initials from a project name ("my-cool_game" -> "MC"). */
export function initials(name: string): string {
  const parts = name.split(/[\s\-_.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0] ?? "";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + (parts[1] ?? "").charAt(0)).toUpperCase();
}

/** Pending questions, newest first. */
export function sortPending(questions: Record<string, LeadQuestion>): LeadQuestion[] {
  return Object.values(questions).sort((a, b) => b.createdAt - a.createdAt);
}

/** One-line preview of what a lead is asking. */
export function shortQuestion(q: LeadQuestion, max = 60): string {
  const text = q.kind === "ask" ? (q.questions[0]?.question ?? "") : "Cần sếp xử lý ở terminal";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat || "Xin ý kiến sếp";
}

export function hasMultiSelect(questions: AskQuestion[]): boolean {
  return questions.some((q) => q.multiSelect === true);
}

/** True once every question has a picked option (and there is at least one question). */
export function allAnswered(questions: AskQuestion[], picks: Record<number, number>): boolean {
  return questions.length > 0 && questions.every((_, i) => picks[i] !== undefined);
}

/** Builds the options answer; null when multiSelect is present or a question is unanswered. */
export function buildOptionsAnswer(questions: AskQuestion[], picks: Record<number, number>): AnswerPayload | null {
  if (hasMultiSelect(questions) || !allAnswered(questions, picks)) return null;
  return { kind: "options", choices: questions.map((_, i) => picks[i] as number) };
}

export function buildTextAnswer(text: string): AnswerPayload | null {
  const trimmed = text.trim();
  return trimmed ? { kind: "text", text: trimmed } : null;
}

export function buildKeysAnswer(keys: TerminalKey[]): AnswerPayload {
  return { kind: "keys", keys };
}

/** Maps a digit key ("1".."9") to the next unanswered single-select question; null if nothing to pick. */
export function pickByDigit(
  questions: AskQuestion[],
  picks: Record<number, number>,
  digit: number,
): { question: number; option: number } | null {
  const qi = questions.findIndex((_, i) => picks[i] === undefined);
  const q = questions[qi];
  if (!q || q.multiSelect || digit < 1 || digit > q.options.length) return null;
  return { question: qi, option: digit - 1 };
}

export function sortedTeams(teams: Record<string, Team>): Team[] {
  return Object.values(teams).sort((a, b) => a.slot - b.slot);
}
