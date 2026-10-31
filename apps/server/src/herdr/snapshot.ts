import type { AgentStatus } from "@studio/shared";
import { HerdrError, isRecord } from "./errors.ts";

export interface RawPane {
  paneId: string;
  terminalId: string;
  workspaceId: string;
  cwd: string | null;
  agentStatus: AgentStatus;
}

export interface RawWorkspace {
  workspaceId: string;
  label: string;
}

export interface RawAgent {
  paneId: string;
  agent: string | null;
}

export interface RawSnapshot {
  panes: RawPane[];
  workspaces: RawWorkspace[];
  agents: RawAgent[];
}

const STATUSES: ReadonlySet<string> = new Set(["idle", "working", "blocked", "done", "unknown"]);

export function parseAgentStatus(value: unknown, where: string): AgentStatus {
  if (typeof value === "string" && STATUSES.has(value)) return value as AgentStatus;
  throw new HerdrError("protocol", `${where}: unexpected agent_status ${JSON.stringify(value)}`);
}

function requireString(row: Record<string, unknown>, key: string, where: string): string {
  const value = row[key];
  if (typeof value !== "string" || value === "") {
    throw new HerdrError("protocol", `${where}: field ${key} must be a non-empty string`);
  }
  return value;
}

function requireRows(snapshot: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const rows = snapshot[key];
  if (!Array.isArray(rows)) throw new HerdrError("protocol", `session.snapshot has no ${key} array`);
  return rows.map((row, index) => {
    if (!isRecord(row)) throw new HerdrError("protocol", `session.snapshot ${key}[${index}] is not an object`);
    return row;
  });
}

/** Validates a session.snapshot `result` (the object holding `snapshot`). Throws on any malformed row. */
export function parseSnapshot(result: unknown): RawSnapshot {
  if (!isRecord(result) || !isRecord(result.snapshot)) {
    throw new HerdrError("protocol", "session.snapshot reply has no snapshot object");
  }
  const snap = result.snapshot;
  const panes = requireRows(snap, "panes").map((row, i): RawPane => {
    const where = `snapshot.panes[${i}]`;
    return {
      paneId: requireString(row, "pane_id", where),
      terminalId: requireString(row, "terminal_id", where),
      workspaceId: requireString(row, "workspace_id", where),
      cwd: typeof row.cwd === "string" && row.cwd !== "" ? row.cwd : null,
      agentStatus: parseAgentStatus(row.agent_status, where),
    };
  });
  const workspaces = requireRows(snap, "workspaces").map((row, i): RawWorkspace => {
    const where = `snapshot.workspaces[${i}]`;
    return {
      workspaceId: requireString(row, "workspace_id", where),
      label: typeof row.label === "string" ? row.label : "",
    };
  });
  const agents = requireRows(snap, "agents").map((row, i): RawAgent => {
    const where = `snapshot.agents[${i}]`;
    return {
      paneId: requireString(row, "pane_id", where),
      agent: typeof row.agent === "string" && row.agent !== "" ? row.agent : null,
    };
  });
  return { panes, workspaces, agents };
}
