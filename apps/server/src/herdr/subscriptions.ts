import type { AgentStatus } from "@studio/shared";
import { isRecord } from "./errors.ts";
import type { SubscriptionSpec } from "./subscription.ts";
import { parseAgentStatus, type RawSnapshot } from "./snapshot.ts";

/** Event types that do not need a pane_id. Any of them means "re-read the snapshot". */
export const GLOBAL_EVENT_TYPES: readonly string[] = [
  "pane.created",
  "pane.closed",
  "pane.updated",
  "pane.exited",
  "pane.agent_detected",
  "pane.focused",
  "pane.moved",
  "workspace.created",
  "workspace.closed",
  "workspace.renamed",
  "workspace.updated",
  "tab.created",
  "tab.closed",
  "worktree.created",
  "worktree.removed",
];

/** Global types plus one pane.agent_status_changed per pane (that type requires pane_id). */
export function buildSubscriptions(paneIds: readonly string[]): SubscriptionSpec[] {
  const global = GLOBAL_EVENT_TYPES.map((type) => ({ type }));
  const perPane = paneIds.map((pane_id) => ({ type: "pane.agent_status_changed", pane_id }));
  return [...global, ...perPane];
}

export interface StatusChange {
  paneId: string;
  status: AgentStatus;
}

/**
 * Reads a pane_agent_status_changed event. Returns null when the payload has no pane id or
 * a null status, so the caller resyncs instead of guessing. An invalid status string throws.
 */
export function parseStatusEvent(data: Record<string, unknown>): StatusChange | null {
  const nested = isRecord(data.pane) ? data.pane : data;
  if (typeof nested.pane_id !== "string" || nested.agent_status === null || nested.agent_status === undefined) {
    return null;
  }
  return { paneId: nested.pane_id, status: parseAgentStatus(nested.agent_status, "pane_agent_status_changed") };
}

/** Sorted pane ids of a snapshot: the key that decides whether the subscription must be replaced. */
export function paneIds(snapshot: RawSnapshot): string[] {
  return snapshot.panes.map((p) => p.paneId).sort();
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
