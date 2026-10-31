import { describe, expect, test } from "bun:test";
import type { AgentStatus, HookEvent, ServerMessage } from "@studio/shared";
import { QuestionTracker } from "../src/questions/tracker.ts";

interface Harness {
  tracker: QuestionTracker;
  emitted: ServerMessage[];
  setStatus: (paneId: string, status: AgentStatus) => void;
  advance: (ms: number) => void;
}

/** Fake clock: scheduled callbacks run only when advance() passes their due time. */
function harness(screen = "line one\nline two"): Harness {
  const emitted: ServerMessage[] = [];
  let now = 0;
  let seq = 0;
  const timers: Array<{ due: number; fn: () => void; cancelled: boolean }> = [];
  const tracker = new QuestionTracker({
    emit: (m) => emitted.push(m),
    readScreenTail: async () => screen,
    schedule: (fn, ms) => {
      const timer = { due: now + ms, fn, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    isKnownTeam: (id) => id.startsWith("w"),
    now: () => now,
    newId: () => `q${++seq}`,
  });
  return {
    tracker,
    emitted,
    setStatus: (paneId, status) => tracker.onStatus(paneId, status),
    advance: (ms) => {
      now += ms;
      for (const t of timers) if (!t.cancelled && t.due <= now) {
        t.cancelled = true;
        t.fn();
      }
    },
  };
}

const askInput = {
  questions: [
    { question: "Pick a color", header: "Color", options: [{ label: "Red" }, { label: "Blue" }], multiSelect: false },
  ],
};

function hook(paneId: string, event: HookEvent["event"], tool = "AskUserQuestion", toolInput: unknown = askInput): HookEvent {
  return { paneId, event, payload: { tool_name: tool, tool_input: toolInput } };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("question lifecycle", () => {
  test("PreToolUse(AskUserQuestion) creates an ask question; PostToolUse removes it", async () => {
    const h = harness();
    await h.tracker.onHookEvent(hook("w1:p1", "PreToolUse"));
    const upsert = h.emitted.find((m) => m.type === "question.upsert");
    expect(upsert?.type === "question.upsert" && upsert.question.kind).toBe("ask");
    expect(h.tracker.list().length).toBe(1);

    await h.tracker.onHookEvent(hook("w1:p1", "PostToolUse"));
    expect(h.tracker.list().length).toBe(0);
    expect(h.emitted.at(-1)).toEqual({ type: "question.remove", questionId: "q1" });
  });

  test("a malformed AskUserQuestion payload is ignored, not turned into a question", async () => {
    const h = harness();
    await h.tracker.onHookEvent(hook("w1:p1", "PreToolUse", "AskUserQuestion", { questions: [{ question: "" }] }));
    expect(h.tracker.list()).toEqual([]);
  });

  test("blocked without a hook question becomes a blocked question after 1500ms", async () => {
    const h = harness();
    h.setStatus("w1:p2", "blocked");
    h.advance(1499);
    await flush();
    expect(h.tracker.list().length).toBe(0);
    h.advance(1);
    await flush();
    const list = h.tracker.list();
    expect(list.length).toBe(1);
    expect(list[0]?.kind).toBe("blocked");
    expect(list[0]?.screenTail).toBe("line one\nline two");
  });

  test("leaving blocked removes a blocked question", async () => {
    const h = harness();
    h.setStatus("w1:p2", "blocked");
    h.advance(1500);
    await flush();
    expect(h.tracker.list().length).toBe(1);
    h.setStatus("w1:p2", "working");
    expect(h.tracker.list().length).toBe(0);
  });

  test("a blocked pane that clears within the grace period raises nothing", async () => {
    const h = harness();
    h.setStatus("w1:p2", "blocked");
    h.advance(500);
    h.setStatus("w1:p2", "working");
    h.advance(5000);
    await flush();
    expect(h.tracker.list()).toEqual([]);
  });

  test("an ask question disappears when the pane leaves blocked after being seen blocked", async () => {
    const h = harness();
    h.setStatus("w1:p1", "blocked");
    await h.tracker.onHookEvent(hook("w1:p1", "PreToolUse"));
    expect(h.tracker.list().length).toBe(1);
    h.setStatus("w1:p1", "working");
    expect(h.tracker.list().length).toBe(0);
  });

  test("an ask question is kept while the pane has not yet reached blocked", async () => {
    const h = harness();
    h.setStatus("w1:p1", "working");
    await h.tracker.onHookEvent(hook("w1:p1", "PreToolUse"));
    h.setStatus("w1:p1", "idle");
    expect(h.tracker.list().length).toBe(1);
  });

  test("a blocked prompt does not duplicate an existing ask question", async () => {
    const h = harness();
    await h.tracker.onHookEvent(hook("w1:p1", "PreToolUse"));
    h.setStatus("w1:p1", "blocked");
    h.advance(5000);
    await flush();
    expect(h.tracker.list().map((q) => q.kind)).toEqual(["ask"]);
  });

  test("removing a team clears its questions and cancels its grace timer", async () => {
    const h = harness();
    h.setStatus("w1:p2", "blocked");
    await h.tracker.onHookEvent(hook("w1:p1", "PreToolUse"));
    h.tracker.onTeamRemoved("w1:p2");
    h.advance(5000);
    await flush();
    expect(h.tracker.list().map((q) => q.teamId)).toEqual(["w1:p1"]);
  });

  test("an ask from an unknown pane is ignored", async () => {
    const h = harness();
    await h.tracker.onHookEvent(hook("zzz", "PreToolUse"));
    expect(h.tracker.list()).toEqual([]);
  });
});
