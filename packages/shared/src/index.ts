/**
 * Wire protocol between the studio server and the web office.
 * herdr is the source of truth; the server only mirrors it and adds question tracking.
 */

export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

/** One team = one herdr pane. The leader is the agent (usually Claude Code) running in it. */
export interface Team {
  /** herdr pane id, e.g. "w3:p1". Stable while the pane lives. */
  id: string;
  workspaceId: string;
  workspaceLabel: string;
  terminalId: string;
  cwd: string;
  /** Last path segment of cwd, used as the desk sign. */
  projectName: string;
  /** Detected agent kind ("claude", ...) or null for a plain shell. */
  agent: string | null;
  status: AgentStatus;
  /** Desk slot in the office grid; assigned by the server and persisted. */
  slot: number;
  /** Subagents the lead has spawned that are still alive (from Claude hooks). */
  members: TeamMember[];
}

/** A subagent working for a team lead. */
export interface TeamMember {
  /** Claude `agent_id` from SubagentStart/SubagentStop. */
  id: string;
  /** Claude `agent_type`, e.g. "Explore", "general-purpose". */
  agentType: string;
  /** Task description the lead gave (Agent tool `description`), if captured. */
  description: string;
  startedAt: number;
}

export interface AskOption {
  label: string;
  description?: string;
}

export interface AskQuestion {
  question: string;
  header?: string;
  options: AskOption[];
  multiSelect?: boolean;
}

/**
 * A pending "lead asks the CEO" item.
 * - kind "ask": captured from the Claude AskUserQuestion hook, has structured questions.
 * - kind "blocked": herdr reports the pane blocked (permission prompt, trust dialog...);
 *   only the visible screen tail is known.
 */
export interface LeadQuestion {
  id: string;
  teamId: string;
  kind: "ask" | "blocked";
  questions: AskQuestion[];
  /** Last lines of the terminal, for context in the dialog. */
  screenTail: string;
  createdAt: number;
}

export type AnswerPayload =
  /** One 0-based option index per question, in order. */
  | { kind: "options"; choices: number[] }
  /** Free text typed into the prompt ("Type something" / other). */
  | { kind: "text"; text: string }
  /** Raw key names for generic blocked prompts, e.g. ["Enter"], ["Down", "Enter"], ["Escape"]. */
  | { kind: "keys"; keys: TerminalKey[] };

export type TerminalKey = "Enter" | "Escape" | "Up" | "Down" | "Left" | "Right" | "Tab" | "y" | "n" | "1" | "2" | "3" | "4";

/** Server → client */
export type ServerMessage =
  | { type: "hello"; teams: Team[]; questions: LeadQuestion[]; herdrConnected: boolean }
  | { type: "team.upsert"; team: Team }
  | { type: "team.remove"; teamId: string }
  | { type: "question.upsert"; question: LeadQuestion }
  | { type: "question.remove"; questionId: string }
  /** Raw terminal bytes (base64). `full` = this frame repaints the whole screen. */
  | { type: "terminal.frame"; teamId: string; data: string; full: boolean }
  | { type: "terminal.closed"; teamId: string; reason: string }
  | { type: "herdr.status"; connected: boolean }
  | { type: "error"; message: string; requestId?: string }
  | { type: "ack"; requestId: string };

/** Client → server */
export type ClientMessage =
  | { type: "terminal.open"; teamId: string; cols: number; rows: number }
  /** data is base64-encoded UTF-8 input bytes (xterm onData output). */
  | { type: "terminal.input"; teamId: string; data: string }
  | { type: "terminal.resize"; teamId: string; cols: number; rows: number }
  | { type: "terminal.close"; teamId: string }
  | { type: "question.answer"; requestId: string; questionId: string; answer: AnswerPayload }
  | { type: "team.create"; requestId: string; projectPath: string; name?: string }
  | { type: "team.prompt"; requestId: string; teamId: string; text: string };

/** Body the Claude hook script POSTs to the server (`POST /hooks/claude`). */
export interface HookEvent {
  /** herdr pane id from $HERDR_PANE_ID, injected into every herdr pane. */
  paneId: string;
  event: "PreToolUse" | "PostToolUse" | "Notification" | "Stop" | "SubagentStart" | "SubagentStop";
  /** Raw hook stdin JSON from Claude Code. */
  payload: Record<string, unknown>;
}

export const WS_PATH = "/ws";
export const HOOK_PATH = "/hooks/claude";
export const DEFAULT_PORT = 7420;
