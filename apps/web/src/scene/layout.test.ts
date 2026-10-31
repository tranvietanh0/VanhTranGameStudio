// @ts-ignore bun:test types are not in this package's tsconfig; bun resolves it at runtime.
import { describe, expect, test } from "bun:test";
import type { Team } from "@studio/shared";
import { askingByTeam, BUBBLE_PREFIX, truncate } from "./asking";
import { advanceAlongPath, screenToWorldDir, stepWithCollision } from "./ceoMotion";
import {
  approachTile, buildOfficeLayout, CEO_SPAWN, CELL_D, CELL_W, deskCenter, DOOR_TILE, ENTRANCE_TILE, MAX_MEMBER_SEATS, MIN_ROWS,
  seatOf, SEATS_PER_POD, slotCell, tileOf,
} from "./layout";
import { assignAllSeats, assignSeats, prettyAgentType } from "./members";
import { findPath, isBlocked } from "./pathfinding";
import { leadId, memberActorId, planCrowd } from "./crowd/plan";

describe("layout", () => {
  test("slot → position mapping is stable and grid-aligned", () => {
    expect(slotCell(0)).toEqual({ col: 0, row: 0 });
    expect(slotCell(5)).toEqual({ col: 1, row: 1 });
    expect(deskCenter(5)).toEqual(deskCenter(5));
    expect(deskCenter(1).x - deskCenter(0).x).toBe(CELL_W);
    expect(deskCenter(4).z - deskCenter(0).z).toBe(CELL_D);
    expect(deskCenter(0)).toEqual({ x: 11.5, z: 4 });
  });

  test("invalid slots fall back to slot 0", () => {
    expect(slotCell(-3)).toEqual({ col: 0, row: 0 });
    expect(slotCell(Number.NaN)).toEqual({ col: 0, row: 0 });
  });

  test("grid grows with slots and keeps a minimum size", () => {
    expect(buildOfficeLayout([]).rows).toBe(MIN_ROWS);
    expect(buildOfficeLayout([0, 23]).rows).toBe(6);
  });

  test("a pod has a lead seat plus member seats, each on its own desk, facing it", () => {
    const seats = Array.from({ length: SEATS_PER_POD }, (_, i) => seatOf(7, i));
    expect(MAX_MEMBER_SEATS).toBe(5);
    expect(new Set(seats.map((s) => `${s.chair.x},${s.chair.z}`)).size).toBe(SEATS_PER_POD);
    for (const s of seats) {
      // The desk is in front of the chair along the seat's facing.
      expect(Math.sign(s.desk.z - s.chair.z)).toBe(Math.sign(Math.cos(s.yaw)));
      expect(s.desk.x).toBeCloseTo(s.chair.x);
    }
    // Out-of-range seat indices clamp instead of throwing.
    expect(seatOf(0, 99)).toEqual(seatOf(0, SEATS_PER_POD - 1));
    expect(approachTile(3)).toEqual(seatOf(3, 0).approach);
  });

  test("every seat of 20 full pods is reachable from the entrance, and seats sit on blocked pod tiles", () => {
    const slots = Array.from({ length: 20 }, (_, i) => i);
    const { grid } = buildOfficeLayout(slots);
    expect(isBlocked(grid, ENTRANCE_TILE.x, ENTRANCE_TILE.z)).toBe(false);
    for (const slot of slots) {
      for (let i = 0; i < SEATS_PER_POD; i++) {
        const seat = seatOf(slot, i);
        expect(isBlocked(grid, seat.approach.x, seat.approach.z)).toBe(false);
        expect(findPath(grid, ENTRANCE_TILE, seat.approach)).not.toBeNull();
        const chair = tileOf(seat.chair.x, seat.chair.z);
        expect(isBlocked(grid, chair.x, chair.z)).toBe(true);
        // The approach tile touches the chair tile, so the last step into the chair is short.
        expect(Math.abs(seat.approach.x - chair.x) + Math.abs(seat.approach.z - chair.z)).toBe(1);
      }
    }
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
    id, workspaceId: "w", workspaceLabel: "W", terminalId: id, cwd: "/", projectName: id, agent: null, status, slot: 0, members: [],
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

describe("member seats", () => {
  const m = (id: string, startedAt: number) => ({ id, agentType: "Explore", description: "", startedAt });

  test("newcomers take the lowest free seat, oldest first; beyond five overflow", () => {
    const r = assignSeats(new Map(), [m("c", 3), m("a", 1), m("b", 2), m("d", 4), m("e", 5), m("f", 6), m("g", 7)]);
    expect([...r.seats.entries()].sort()).toEqual([["a", 1], ["b", 2], ["c", 3], ["d", 4], ["e", 5]]);
    expect(r.overflow).toBe(2);
  });

  test("members keep their seat when others leave, and a waiting member gets the freed seat", () => {
    const first = assignSeats(new Map(), [m("a", 1), m("b", 2), m("c", 3), m("d", 4), m("e", 5), m("f", 6)]);
    const next = assignSeats(first.seats, [m("a", 1), m("c", 3), m("d", 4), m("e", 5), m("f", 6)]);
    expect(next.seats.get("c")).toBe(3);
    expect(next.seats.get("f")).toBe(2);
    expect(next.overflow).toBe(0);
  });

  test("assignAllSeats is per team and tolerates teams without members", () => {
    const all = assignAllSeats(new Map(), [{ id: "t1", members: [m("x", 1)] }, { id: "t2" }]);
    expect(all.get("t1")?.seats.get("x")).toBe(1);
    expect(all.get("t2")?.seats.size).toBe(0);
  });

  test("agent types read nicely on nameplates", () => {
    expect(prettyAgentType("general-purpose")).toBe("General purpose");
    expect(prettyAgentType("  ")).toBe("Agent");
  });
});

describe("crowd plan", () => {
  const team = (id: string, slot: number, members: Team["members"]): Team => ({
    id, workspaceId: "w", workspaceLabel: "W", terminalId: id, cwd: "/", projectName: id, agent: "claude", status: "working", slot, members,
  });

  test("CEO, one lead per team, and only seated members become actors", () => {
    const members = Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, agentType: i % 2 ? "Explore" : "Plan", description: "x".repeat(60), startedAt: i }));
    const teams = [team("t1", 0, members), team("t2", 1, [])];
    const specs = planCrowd(teams, assignAllSeats(new Map(), teams));
    expect(specs.filter((s) => s.role === "ceo").length).toBe(1);
    expect(specs.filter((s) => s.role === "lead").map((s) => s.id)).toEqual([leadId("t1"), leadId("t2")]);
    const seated = specs.filter((s) => s.role === "member");
    expect(seated.length).toBe(MAX_MEMBER_SEATS);
    expect(seated[0]?.id).toBe(memberActorId("t1", "m0"));
    expect(seated[0]?.subtitle.endsWith("…")).toBe(true);
    // Same agent type → same look.
    const plans = seated.filter((s) => s.title === "Plan").map((s) => s.variant);
    expect(new Set(plans).size).toBe(1);
  });
});
