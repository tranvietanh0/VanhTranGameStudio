import type { HookEvent, TeamMember } from "@studio/shared";
import { isRecord } from "../herdr/errors.ts";
import { logWarn } from "../log.ts";

/** A spawn the lead requested whose SubagentStart has not arrived yet. */
export const PENDING_TTL_MS = 60_000;
/** Safety net: a member with no SubagentStop for this long is dropped (background agents can outlive the turn). */
export const MEMBER_TTL_MS = 2 * 60 * 60 * 1000;
export const MEMBER_SWEEP_MS = 60_000;

const SPAWN_TOOLS: ReadonlySet<string> = new Set(["Agent", "Task"]);
const DESCRIPTION_MAX = 60;
const DEFAULT_SUBAGENT_TYPE = "general-purpose";

interface PendingSpawn {
  description: string;
  subagentType: string;
  at: number;
}

export interface MemberTrackerOptions {
  /** Receives the full member list of a pane each time it changes (empty list = none left). */
  onChange: (paneId: string, members: TeamMember[]) => void;
  now?: () => number;
  warn?: (message: string) => void;
}

/**
 * Live subagents per herdr pane (team lead). Pairs each Agent/Task spawn with its SubagentStart
 * by subagent type (FIFO), removes members on SubagentStop, and clears a pane when its agent leaves.
 * The Stop hook deliberately does not clear: background subagents outlive the lead's turn.
 */
export class MemberTracker {
  private readonly pending = new Map<string, PendingSpawn[]>();
  private readonly byPane = new Map<string, TeamMember[]>();
  private readonly unknownShapesLogged = new Set<string>();
  private readonly now: () => number;
  private readonly warn: (message: string) => void;

  constructor(private readonly opts: MemberTrackerOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.warn = opts.warn ?? ((message) => logWarn("members", message));
  }

  members(paneId: string): TeamMember[] {
    return this.byPane.get(paneId) ?? [];
  }

  onHookEvent(event: HookEvent): void {
    const { payload, paneId } = event;
    if (event.event === "PreToolUse" && SPAWN_TOOLS.has(String(payload.tool_name))) {
      this.recordSpawn(paneId, payload.tool_input);
      return;
    }
    if (event.event === "SubagentStart") this.onStart(paneId, payload);
    if (event.event === "SubagentStop") this.onStop(paneId, payload);
  }

  /** The pane's agent changed. A null agent means the lead is gone, so its members go with it. */
  onAgentChange(paneId: string, agent: string | null): void {
    if (agent === null) this.clearPane(paneId);
  }

  onPaneRemoved(paneId: string): void {
    this.clearPane(paneId);
  }

  /** Drops stale pending spawns and members past MEMBER_TTL_MS. Called on an interval by the services. */
  sweep(): void {
    const now = this.now();
    for (const [paneId, list] of [...this.pending]) {
      const fresh = this.freshPending(list, now);
      if (fresh.length === 0) this.pending.delete(paneId);
      else this.pending.set(paneId, fresh);
    }
    for (const [paneId, list] of [...this.byPane]) {
      const kept = list.filter((member) => {
        const expired = now - member.startedAt > MEMBER_TTL_MS;
        if (expired) {
          this.warn(`dropped member ${member.id} of pane ${paneId}: no SubagentStop within 2h (TTL)`);
        }
        return !expired;
      });
      if (kept.length !== list.length) this.replace(paneId, kept);
    }
  }

  private recordSpawn(paneId: string, toolInput: unknown): void {
    if (!isRecord(toolInput)) {
      this.logUnknownShape("spawn", toolInput);
      return;
    }
    const spawn: PendingSpawn = {
      description: describeSpawn(toolInput),
      subagentType: stringField(toolInput.subagent_type) ?? "",
      at: this.now(),
    };
    const list = this.freshPending(this.pending.get(paneId) ?? [], spawn.at);
    list.push(spawn);
    this.pending.set(paneId, list);
  }

  private onStart(paneId: string, payload: Record<string, unknown>): void {
    const id = pickString(payload, ["agent_id", "agentId"]);
    if (!id) {
      this.logUnknownShape("SubagentStart", payload);
      return;
    }
    const current = this.members(paneId);
    if (current.some((member) => member.id === id)) return;

    const agentType = pickString(payload, ["agent_type", "subagent_type", "agentType"]) ?? "";
    const now = this.now();
    const list = this.freshPending(this.pending.get(paneId) ?? [], now);
    const index = pairingIndex(list, agentType);
    const [matched] = index >= 0 ? list.splice(index, 1) : [];
    this.pending.set(paneId, list);

    this.replace(paneId, [
      ...current,
      { id, agentType, description: matched?.description ?? "", startedAt: now },
    ]);
  }

  private onStop(paneId: string, payload: Record<string, unknown>): void {
    const id = pickString(payload, ["agent_id", "agentId"]);
    if (!id) {
      this.logUnknownShape("SubagentStop", payload);
      return;
    }
    const current = this.members(paneId);
    const kept = current.filter((member) => member.id !== id);
    if (kept.length !== current.length) this.replace(paneId, kept);
  }

  private clearPane(paneId: string): void {
    this.pending.delete(paneId);
    if (this.members(paneId).length > 0) this.replace(paneId, []);
    this.byPane.delete(paneId);
  }

  /** Stores the new list and emits it, but only when it actually changed. */
  private replace(paneId: string, next: TeamMember[]): void {
    if (next.length === 0) this.byPane.delete(paneId);
    else this.byPane.set(paneId, next);
    this.opts.onChange(paneId, [...next]);
  }

  private freshPending(list: PendingSpawn[], now: number): PendingSpawn[] {
    return list.filter((spawn) => now - spawn.at <= PENDING_TTL_MS);
  }

  /** Logs an unexpected payload shape once per event kind, never per event. */
  private logUnknownShape(kind: string, raw: unknown): void {
    if (this.unknownShapesLogged.has(kind)) return;
    this.unknownShapesLogged.add(kind);
    const keys = isRecord(raw) ? Object.keys(raw).join(",") : typeof raw;
    this.warn(`unexpected ${kind} payload shape (keys: ${keys || "none"}); ignored`);
  }
}

/** Oldest pending spawn with the same subagent type, else the oldest of any type, else -1. */
function pairingIndex(list: PendingSpawn[], agentType: string): number {
  const sameType = list.findIndex((spawn) => (spawn.subagentType || DEFAULT_SUBAGENT_TYPE) === (agentType || DEFAULT_SUBAGENT_TYPE));
  if (sameType >= 0) return sameType;
  return list.length > 0 ? 0 : -1;
}

function describeSpawn(toolInput: Record<string, unknown>): string {
  const description = stringField(toolInput.description);
  if (description) return description;
  const prompt = stringField(toolInput.prompt) ?? "";
  return prompt.slice(0, DESCRIPTION_MAX);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** First non-empty string under any of the given keys. Tolerates the snake_case and camelCase shapes. */
function pickString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringField(payload[key]);
    if (value) return value;
  }
  return undefined;
}
