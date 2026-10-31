// @ts-ignore bun:test types are not in this package's tsconfig; bun resolves it at runtime.
import { describe, expect, test } from "bun:test";
import { blockRect, createGrid, findPath, isBlocked, setBlocked, type Tile } from "./pathfinding";

function assertWalkable(path: Tile[], blocked: (t: Tile) => boolean): void {
  for (const t of path) expect(blocked(t)).toBe(false);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Tile;
    const b = path[i] as Tile;
    expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBe(1);
  }
}

describe("findPath", () => {
  test("straight line on an empty grid", () => {
    const g = createGrid(6, 3);
    const path = findPath(g, { x: 0, z: 1 }, { x: 5, z: 1 });
    expect(path).not.toBeNull();
    expect(path?.length).toBe(6);
    expect(path?.[0]).toEqual({ x: 0, z: 1 });
    expect(path?.[5]).toEqual({ x: 5, z: 1 });
  });

  test("routes around a wall instead of through it", () => {
    const g = createGrid(7, 7);
    blockRect(g, 3, 0, 1, 6); // wall at x=3, gap only at z=6
    const path = findPath(g, { x: 0, z: 0 }, { x: 6, z: 0 });
    expect(path).not.toBeNull();
    const p = path as Tile[];
    assertWalkable(p, (t) => isBlocked(g, t.x, t.z));
    expect(p.some((t) => t.x === 3 && t.z === 6)).toBe(true);
  });

  test("does not cut diagonally between two touching obstacles", () => {
    const g = createGrid(3, 3);
    setBlocked(g, 1, 0);
    setBlocked(g, 0, 1);
    expect(findPath(g, { x: 0, z: 0 }, { x: 1, z: 1 })).toBeNull();
  });

  test("unreachable target returns null", () => {
    const g = createGrid(5, 5);
    blockRect(g, 2, 0, 1, 5);
    expect(findPath(g, { x: 0, z: 2 }, { x: 4, z: 2 })).toBeNull();
  });

  test("blocked or out-of-bounds goal returns null", () => {
    const g = createGrid(4, 4);
    setBlocked(g, 2, 2);
    expect(findPath(g, { x: 0, z: 0 }, { x: 2, z: 2 })).toBeNull();
    expect(findPath(g, { x: 0, z: 0 }, { x: 9, z: 0 })).toBeNull();
  });

  test("start equal to goal yields a one-tile path", () => {
    const g = createGrid(2, 2);
    expect(findPath(g, { x: 1, z: 1 }, { x: 1, z: 1 })).toEqual([{ x: 1, z: 1 }]);
  });
});
