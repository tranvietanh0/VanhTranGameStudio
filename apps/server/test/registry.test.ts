import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RegistryEvent } from "../src/teams/registry.ts";
import { parseSnapshot } from "../src/herdr/snapshot.ts";
import { projectNameFrom, snapshotToDrafts } from "../src/teams/mapping.ts";
import { SlotStore, lowestFreeSlot, parseOfficeFile } from "../src/teams/slots.ts";
import { TeamRegistry } from "../src/teams/registry.ts";
import fixture from "./fixtures/snapshot.json";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "studio-registry-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("snapshot to team mapping", () => {
  test("one team per pane, agent joined by pane id, project name from cwd", () => {
    const drafts = snapshotToDrafts(parseSnapshot(fixture));
    expect(drafts.map((d) => d.id)).toEqual(["w1:p1", "w1:p2", "w2:p1"]);

    const lead = drafts[0];
    expect(lead?.agent).toBe("claude");
    expect(lead?.status).toBe("working");
    expect(lead?.projectName).toBe("Game");
    expect(lead?.workspaceLabel).toBe("game-demo");
    expect(lead?.terminalId).toBe("term_aaa111");

    const shell = drafts[1];
    expect(shell?.agent).toBeNull();
    expect(shell?.status).toBe("blocked");
    // trailing separator must not produce an empty project name
    expect(shell?.projectName).toBe("Game");
  });

  test("a pane without cwd falls back to its workspace label", () => {
    expect(projectNameFrom("", "fallback-label")).toBe("fallback-label");
    expect(projectNameFrom("C:\\Users\\demo\\", "x")).toBe("demo");
  });

  test("a malformed pane row is rejected, not silently dropped", () => {
    const broken = structuredClone(fixture) as { snapshot: { panes: Record<string, unknown>[] } };
    broken.snapshot.panes[0] = { ...broken.snapshot.panes[0], agent_status: "sleeping" };
    expect(() => parseSnapshot(broken)).toThrow(/unexpected agent_status/);
  });
});

describe("slot assignment", () => {
  test("lowest free slot, with gaps reused", () => {
    expect(lowestFreeSlot(new Set([0, 1, 3]))).toBe(2);
    expect(lowestFreeSlot(new Set())).toBe(0);
  });

  test("slots persist across store instances and survive pane reordering", () => {
    const file = join(dir, "office.json");
    const first = new SlotStore(file);
    expect(first.assign("w1:p1")).toBe(0);
    expect(first.assign("w1:p2")).toBe(1);
    expect(first.assign("w1:p1")).toBe(0);

    const reloaded = new SlotStore(file);
    expect(reloaded.slotOf("w1:p2")).toBe(1);
    expect(reloaded.assign("w9:p9")).toBe(2);
  });

  test("prune releases slots of panes that disappeared, and they are reused", () => {
    const file = join(dir, "office.json");
    const store = new SlotStore(file);
    store.assign("a");
    store.assign("b");
    store.assign("c");
    expect(store.prune(new Set(["a", "c"]))).toBe(true);
    expect(store.assign("d")).toBe(1);
    expect(JSON.parse(readFileSync(file, "utf8")).slots).toEqual({ a: 0, c: 2, d: 1 });
  });

  test("a corrupt office file is an error, never silently reset", () => {
    expect(() => parseOfficeFile("{not json", "office.json")).toThrow(/not valid JSON/);
    expect(() => parseOfficeFile('{"version":1,"slots":{"a":-1}}', "office.json")).toThrow(/non-negative/);
  });
});

describe("TeamRegistry", () => {
  test("applySnapshot emits upserts once, then only real changes, then removes", () => {
    const store = new SlotStore(join(dir, "office.json"));
    const registry = new TeamRegistry(store);
    const events: RegistryEvent[] = [];
    registry.subscribe((e) => events.push(e));

    const drafts = snapshotToDrafts(parseSnapshot(fixture));
    registry.applySnapshot(drafts);
    expect(events.filter((e) => e.type === "team.upsert").length).toBe(3);
    expect(registry.list().map((t) => t.slot)).toEqual([0, 1, 2]);

    events.length = 0;
    registry.applySnapshot(drafts);
    expect(events).toEqual([]);

    registry.applySnapshot(drafts.slice(0, 2));
    expect(events).toEqual([{ type: "team.remove", teamId: "w2:p1" }]);
    expect(registry.get("w2:p1")).toBeUndefined();
  });

  test("updateStatus emits only on change and reports unknown panes", () => {
    const registry = new TeamRegistry(new SlotStore(join(dir, "office.json")));
    registry.applySnapshot(snapshotToDrafts(parseSnapshot(fixture)));
    const events: RegistryEvent[] = [];
    registry.subscribe((e) => events.push(e));

    expect(registry.updateStatus("w1:p1", "working")).toBe(true);
    expect(events.length).toBe(0);
    expect(registry.updateStatus("w1:p1", "done")).toBe(true);
    expect(events.length).toBe(1);
    expect(registry.updateStatus("nope:p9", "idle")).toBe(false);
  });
});
