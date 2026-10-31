import type { AgentStatus, Team } from "@studio/shared";
import type { RawSnapshot } from "../herdr/snapshot.ts";

/** A team as herdr describes it, before the server assigns its desk slot. */
export type TeamDraft = Omit<Team, "slot">;

/** Last non-empty path segment of cwd (Windows or POSIX separators), or the fallback. */
export function projectNameFrom(cwd: string, fallback: string): string {
  const segments = cwd.split(/[\\/]+/).filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? fallback;
}

/**
 * One team per herdr pane. The agent kind comes from snapshot.agents (joined by pane id);
 * a pane with no agent is a plain shell and keeps agent = null.
 */
export function snapshotToDrafts(snapshot: RawSnapshot): TeamDraft[] {
  const labels = new Map(snapshot.workspaces.map((w) => [w.workspaceId, w.label]));
  const agents = new Map(snapshot.agents.map((a) => [a.paneId, a.agent]));

  return snapshot.panes.map((pane): TeamDraft => {
    const workspaceLabel = labels.get(pane.workspaceId) ?? pane.workspaceId;
    const cwd = pane.cwd ?? "";
    return {
      id: pane.paneId,
      workspaceId: pane.workspaceId,
      workspaceLabel,
      terminalId: pane.terminalId,
      cwd,
      projectName: projectNameFrom(cwd, workspaceLabel),
      agent: agents.get(pane.paneId) ?? null,
      status: pane.agentStatus satisfies AgentStatus,
    };
  });
}
