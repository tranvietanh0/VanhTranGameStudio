import { describe, expect, test } from "bun:test";
import type { HookEvent, TeamMember } from "@studio/shared";
import { MemberTracker } from "../src/teams/members.ts";
import { TeamRegistry, type RegistryEvent } from "../src/teams/registry.ts";
import { SlotStore } from "../src/teams/slots.ts";
import { snapshotToDrafts } from "../src/teams/mapping.ts";
import { parseSnapshot } from "../src/herdr/snapshot.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fixture from "./fixtures/snapshot.json";

const PANE = "w1:p1";
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const PENDING_TTL_MS = 60_000;

function hook(event: HookEvent["event"], payload: Record<string, unknown>, paneId = PANE): HookEvent {
  return { paneId, event, payload };
}

const spawn = (description: string, subagentType: string, paneId = PANE): HookEvent =>
  hook(
    "PreToolUse",
    { tool_name: "Agent", tool_input: { description, subagent_type: subagentType, prompt: "do the thing" } },
    paneId,
  );
const start = (agentId: string, agentType: string, paneId = PANE): HookEvent =>
  hook("SubagentStart", { agent_id: agentId, agent_type: agentType }, paneId);
const stop = (agentId: string, paneId = PANE): HookEvent => hook("SubagentStop", { agent_id: agentId }, paneId);

function setup() {
  let clock = 1_000_000;
  const changes: Array<{ paneId: string; members: TeamMember[] }> = [];
  const warnings: string[] = [];
  const tracker = new MemberTracker({
    onChange: (paneId, members) => changes.push({ paneId, members }),
    now: () => clock,
    warn: (message) => warnings.push(message),
  });
  return {
    tracker,
    changes,
    warnings,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("MemberTracker: description pairing", () => {
  test("SubagentStart takes the description of the pending spawn with the same subagent type", () => {
    const { tracker } = setup();
    tracker.onHookEvent(spawn("map the auth module", "Explore"));
    tracker.onHookEvent(spawn("write release notes", "general-purpose"));
    tracker.onHookEvent(start("a1", "general-purpose"));

    const [member] = tracker.members(PANE);
    expect(member?.id).toBe("a1");
    expect(member?.agentType).toBe("general-purpose");
    expect(member?.description).toBe("write release notes");
  });

  test("with no type match, the oldest pending spawn is used; with none at all, description is empty", () => {
    const { tracker } = setup();
    tracker.onHookEvent(spawn("map the auth module", "Explore"));
    tracker.onHookEvent(start("a1", "Plan"));
    expect(tracker.members(PANE)[0]?.description).toBe("map the auth module");

    tracker.onHookEvent(start("a2", "Plan"));
    expect(tracker.members(PANE)[1]?.description).toBe("");
  });

  test("description falls back to the first 60 characters of the prompt", () => {
    const { tracker } = setup();
    const longPrompt = "x".repeat(100);
    tracker.onHookEvent(
      hook("PreToolUse", { tool_name: "Task", tool_input: { subagent_type: "Explore", prompt: longPrompt } }),
    );
    tracker.onHookEvent(start("a1", "Explore"));
    expect(tracker.members(PANE)[0]?.description).toBe("x".repeat(60));
  });
});

describe("MemberTracker: FIFO with parallel same-type spawns", () => {
  test("two parallel Explore spawns pair with their start events in spawn order", () => {
    const { tracker } = setup();
    tracker.onHookEvent(spawn("first", "Explore"));
    tracker.onHookEvent(spawn("second", "Explore"));
    tracker.onHookEvent(start("a1", "Explore"));
    tracker.onHookEvent(start("a2", "Explore"));

    expect(tracker.members(PANE).map((m) => [m.id, m.description])).toEqual([
      ["a1", "first"],
      ["a2", "second"],
    ]);
  });

  test("a pending spawn is consumed once, not reused by a later start", () => {
    const { tracker } = setup();
    tracker.onHookEvent(spawn("only one", "Explore"));
    tracker.onHookEvent(start("a1", "Explore"));
    tracker.onHookEvent(start("a2", "Explore"));
    expect(tracker.members(PANE).map((m) => m.description)).toEqual(["only one", ""]);
  });

  test("a pending spawn older than 60s is dropped, not paired", () => {
    const { tracker, advance } = setup();
    tracker.onHookEvent(spawn("stale", "Explore"));
    advance(PENDING_TTL_MS + 1);
    tracker.onHookEvent(start("a1", "Explore"));
    expect(tracker.members(PANE)[0]?.description).toBe("");
  });
});

describe("MemberTracker: lifecycle", () => {
  test("SubagentStop removes exactly that member and emits the new list", () => {
    const { tracker, changes } = setup();
    tracker.onHookEvent(start("a1", "Explore"));
    tracker.onHookEvent(start("a2", "Plan"));
    tracker.onHookEvent(stop("a1"));

    expect(tracker.members(PANE).map((m) => m.id)).toEqual(["a2"]);
    expect(changes.at(-1)?.members.map((m) => m.id)).toEqual(["a2"]);
  });

  test("SubagentStop for an unknown agent is a no-op and emits nothing", () => {
    const { tracker, changes } = setup();
    tracker.onHookEvent(start("a1", "Explore"));
    const before = changes.length;
    tracker.onHookEvent(stop("ghost"));
    expect(changes.length).toBe(before);
    expect(tracker.members(PANE).length).toBe(1);
  });

  test("the Stop hook does not clear members: background subagents outlive the lead's turn", () => {
    const { tracker } = setup();
    tracker.onHookEvent(start("a1", "general-purpose"));
    tracker.onHookEvent(hook("Stop", {}));
    expect(tracker.members(PANE).map((m) => m.id)).toEqual(["a1"]);
  });

  test("closing the pane clears its members and emits an empty list", () => {
    const { tracker, changes } = setup();
    tracker.onHookEvent(start("a1", "Explore"));
    tracker.onPaneRemoved(PANE);
    expect(tracker.members(PANE)).toEqual([]);
    expect(changes.at(-1)).toEqual({ paneId: PANE, members: [] });
  });

  test("the pane's agent leaving (agent becomes null) clears its members", () => {
    const { tracker, changes } = setup();
    tracker.onHookEvent(start("a1", "Explore"));
    tracker.onAgentChange(PANE, null);
    expect(tracker.members(PANE)).toEqual([]);
    expect(changes.at(-1)?.members).toEqual([]);
  });

  test("members of different panes stay separate", () => {
    const { tracker } = setup();
    tracker.onHookEvent(start("a1", "Explore", "w1:p1"));
    tracker.onHookEvent(start("b1", "Explore", "w2:p1"));
    tracker.onPaneRemoved("w1:p1");
    expect(tracker.members("w2:p1").map((m) => m.id)).toEqual(["b1"]);
  });
});

describe("MemberTracker: safety TTL", () => {
  test("a member with no stop for 2 hours is dropped and the drop is logged", () => {
    const { tracker, changes, warnings, advance } = setup();
    tracker.onHookEvent(start("a1", "Explore"));
    advance(TWO_HOURS_MS - 1);
    tracker.sweep();
    expect(tracker.members(PANE).length).toBe(1);

    advance(2);
    tracker.sweep();
    expect(tracker.members(PANE)).toEqual([]);
    expect(changes.at(-1)?.members).toEqual([]);
    expect(warnings.some((w) => /a1/.test(w) && /2h|TTL|stop/i.test(w))).toBe(true);
  });
});

describe("MemberTracker: change emission", () => {
  test("emits once per real change and never on a no-op", () => {
    const { tracker, changes } = setup();
    tracker.onHookEvent(hook("PreToolUse", { tool_name: "AskUserQuestion", tool_input: {} }));
    tracker.onHookEvent(hook("Notification", {}));
    expect(changes.length).toBe(0);

    tracker.onHookEvent(start("a1", "Explore"));
    expect(changes.length).toBe(1);
    tracker.onHookEvent(spawn("pending only", "Explore"));
    expect(changes.length).toBe(1);
    tracker.onHookEvent(stop("a1"));
    expect(changes.length).toBe(2);
  });
});

describe("MemberTracker: payload tolerance", () => {
  test("accepts camelCase and alternate field names", () => {
    const { tracker } = setup();
    tracker.onHookEvent(hook("SubagentStart", { agentId: "b1", subagent_type: "Explore" }));
    expect(tracker.members(PANE).map((m) => [m.id, m.agentType])).toEqual([["b1", "Explore"]]);
  });

  test("a start without an id is ignored and the unknown shape is logged once", () => {
    const { tracker, warnings } = setup();
    tracker.onHookEvent(hook("SubagentStart", { weird: true }));
    tracker.onHookEvent(hook("SubagentStart", { weird: true }));
    expect(tracker.members(PANE)).toEqual([]);
    expect(warnings.length).toBe(1);
  });
});

describe("TeamRegistry: member merge", () => {
  test("setMembers emits team.upsert carrying members, and snapshot re-apply keeps them", () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-members-"));
    try {
      const registry = new TeamRegistry(new SlotStore(join(dir, "office.json")));
      const drafts = snapshotToDrafts(parseSnapshot(fixture));
      registry.applySnapshot(drafts);

      const events: RegistryEvent[] = [];
      registry.subscribe((e) => events.push(e));
      const member: TeamMember = { id: "a1", agentType: "Explore", description: "map", startedAt: 1 };
      registry.setMembers(drafts[0]?.id ?? "", [member]);
      expect(events.length).toBe(1);
      const upsert = events[0];
      expect(upsert?.type).toBe("team.upsert");
      if (upsert?.type === "team.upsert") expect(upsert.team.members).toEqual([member]);

      events.length = 0;
      registry.applySnapshot(drafts);
      expect(events).toEqual([]);
      expect(registry.get(drafts[0]?.id ?? "")?.members).toEqual([member]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
