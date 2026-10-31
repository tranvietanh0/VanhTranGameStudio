// @ts-ignore bun:test types are not in this package's tsconfig; bun resolves it at runtime.
import { describe, expect, test } from "bun:test";
import type { Team } from "@studio/shared";
import { askingByTeam, BUBBLE_PREFIX, truncate } from "./asking";
import { advanceAlongPath, screenToWorldDir, stepWithCollision } from "./ceoMotion";
import {
  approachTile, buildOfficeLayout, CEO_SPAWN, deskCenter, DOOR_TILE, MIN_ROWS, slotCell, tileOf,
} from "./layout";
import { findPath, isBlocked } from "./pathfinding";

describe("layout", () => {
  test("slot → position mapping is stable and grid-aligned", () => {
    expect(slotCell(0)).toEqual({ col: 0, row: 0 });
    expect(slotCell(5)).toEqual({ col: 1, row: 1 });
    expect(deskCenter(5)).toEqual(deskCenter(5));
    expect(deskCenter(1).x - deskCenter(0).x).toBe(4);
    expect(deskCenter(4).z - deskCenter(0).z).toBe(4);
    expect(deskCenter(0)).toEqual({ x: 11, z: 2.5 });
  });

  test("invalid slots fall back to slot 0", () => {
    expect(slotCell(-3)).toEqual({ col: 0, row: 0 });
    expect(slotCell(Number.NaN)).toEqual({ col: 0, row: 0 });
  });

  test("grid grows with slots and keeps a minimum size", () => {
    expect(buildOfficeLayout([]).rows).toBe(MIN_ROWS);
    expect(buildOfficeLayout([0, 23]).rows).toBe(6);
  });

  test("every occupied desk has a reachable approach tile from the CEO spawn", () => {
    const slots = Array.from({ length: 20 }, (_, i) => i);
    const { grid } = buildOfficeLayout(slots);
    const start = tileOf(CEO_SPAWN.x, CEO_SPAWN.z);
    for (const slot of slots) {
      const goal = approachTile(slot);
      expect(isBlocked(grid, goal.x, goal.z)).toBe(false);
      expect(findPath(grid, start, goal)).not.toBeNull();
    }
    const desk = tileOf(deskCenter(3).x, deskCenter(3).z);
    expect(isBlocked(grid, desk.x, desk.z)).toBe(true);
  });

  test("CEO room is closed except for the door", () => {
    const { grid } = buildOfficeLayout([0]);
    expect(isBlocked(grid, DOOR_TILE.x, DOOR_TILE.z)).toBe(false);
    const path = findPath(grid, tileOf(CEO_SPAWN.x, CEO_SPAWN.z), { x: 8, z: 1 }) ?? [];
    expect(path.some((t) => t.x === DOOR_TILE.x && t.z === DOOR_TILE.z)).toBe(true);
  });
});

describe("ceo motion", () => {
  test("advances along waypoints and consumes reached ones", () => {
    const step = advanceAlongPath({ x: 0, z: 0 }, [{ x: 1, z: 0 }, { x: 1, z: 2 }], 1.5);
    expect(step.x).toBeCloseTo(1);
    expect(step.z).toBeCloseTo(0.5);
    expect(step.path.length).toBe(1);
  });

  test("keyboard step slides along a wall instead of entering it", () => {
    const { grid } = buildOfficeLayout([]);
    const next = stepWithCollision(grid, { x: 6.5, z: 1.5 }, 0.5, 0.3);
    expect(next.x).toBeCloseTo(6.5);
    expect(next.z).toBeCloseTo(1.8);
  });

  test("screen-up maps to the far corner of the iso view", () => {
    const up = screenToWorldDir(0, 1);
    expect(up.x).toBeCloseTo(-Math.SQRT1_2);
    expect(up.z).toBeCloseTo(-Math.SQRT1_2);
  });
});

describe("asking leads", () => {
  const team = (id: string, status: Team["status"]): Team => ({
    id, workspaceId: "w", workspaceLabel: "W", terminalId: id, cwd: "/", projectName: id, agent: null, status, slot: 0,
  });

  test("question wins over blocked status, blocked alone still asks", () => {
    const map = askingByTeam([team("a", "working"), team("b", "blocked"), team("c", "idle")], {
      q1: { id: "q1", teamId: "a", kind: "ask", questions: [{ question: "x".repeat(60), options: [] }], screenTail: "", createdAt: 1 },
    });
    expect(map.get("a")?.questionId).toBe("q1");
    expect(map.get("a")?.preview.length).toBe(41);
    expect(map.get("b")).toEqual({ questionId: null, preview: "" });
    expect(map.has("c")).toBe(false);
  });

  test("truncate collapses whitespace", () => {
    expect(truncate("  a \n b ")).toBe("a b");
    expect(BUBBLE_PREFIX.startsWith("Sếp ơi")).toBe(true);
  });
});
