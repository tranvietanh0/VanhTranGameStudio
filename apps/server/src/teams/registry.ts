import type { AgentStatus, Team, TeamMember } from "@studio/shared";
import type { SlotStore } from "./slots.ts";
import type { TeamDraft } from "./mapping.ts";

export type RegistryEvent =
  | { type: "team.upsert"; team: Team }
  | { type: "team.remove"; teamId: string };

export type RegistryListener = (event: RegistryEvent) => void;

/**
 * Team list mirrored from herdr. Emits only real changes, so a no-op snapshot
 * produces no traffic. Slots come from SlotStore and survive restarts.
 */
export class TeamRegistry {
  private readonly teams = new Map<string, Team>();
  /** Live subagents per pane, mirrored from MemberTracker. Kept across snapshot re-applies. */
  private readonly members = new Map<string, TeamMember[]>();
  private readonly listeners = new Set<RegistryListener>();

  constructor(private readonly slots: SlotStore) {}

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(): Team[] {
    return [...this.teams.values()].sort((a, b) => a.slot - b.slot);
  }

  get(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  /** Replaces the whole team set with the given drafts. Removed panes emit team.remove. */
  applySnapshot(drafts: TeamDraft[]): void {
    const liveIds = new Set(drafts.map((d) => d.id));
    this.slots.prune(liveIds);
    for (const teamId of [...this.teams.keys()]) {
      if (!liveIds.has(teamId)) this.remove(teamId);
    }
    for (const draft of drafts) {
      this.put({ ...draft, members: this.members.get(draft.id) ?? [], slot: this.slots.assign(draft.id) });
    }
  }

  /**
   * Replaces a pane's live subagent list and emits team.upsert when it changed.
   * Returns false when the pane is unknown; its list is then dropped (it arrives with the next snapshot).
   */
  setMembers(teamId: string, members: TeamMember[]): boolean {
    const team = this.teams.get(teamId);
    if (!team) {
      this.members.delete(teamId);
      return false;
    }
    if (members.length === 0) this.members.delete(teamId);
    else this.members.set(teamId, members);
    this.put({ ...team, members });
    return true;
  }

  /** Applies a live status change. Returns false when the pane is unknown (caller should resync). */
  updateStatus(teamId: string, status: AgentStatus): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;
    if (team.status !== status) this.put({ ...team, status });
    return true;
  }

  private put(team: Team): void {
    const previous = this.teams.get(team.id);
    if (previous && JSON.stringify(previous) === JSON.stringify(team)) return;
    this.teams.set(team.id, team);
    this.emit({ type: "team.upsert", team });
  }

  private remove(teamId: string): void {
    this.teams.delete(teamId);
    this.members.delete(teamId);
    this.emit({ type: "team.remove", teamId });
  }

  private emit(event: RegistryEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
