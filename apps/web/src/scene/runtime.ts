import { CEO_SPAWN, tileCenter, tileOf, type Point } from "./layout";
import { findPath, type Grid, type Tile } from "./pathfinding";

/**
 * Per-frame mutable scene state shared by the avatar, camera and overlays. Kept out of React and
 * zustand on purpose: it changes every rendered frame and must never trigger a React render.
 */
export const ceo = {
  x: CEO_SPAWN.x as number,
  z: CEO_SPAWN.z as number,
  heading: 0,
  path: [] as Point[],
  /** True while walking (path or keys); drives the walk animation and keeps frames coming. */
  moving: false,
};

export type FocusMode = "ceo" | "point";

/** What the camera centres on: the CEO, or a fixed point (a selected desk). */
export const focus = { mode: "ceo" as FocusMode, x: CEO_SPAWN.x as number, z: CEO_SPAWN.z as number };

/** Team pod under the mouse pointer (desktop hover), read by overlays on rendered frames. */
export const hover = { teamId: null as string | null };

/** Sets the hovered pod and requests one frame so overlays can react. No-op when unchanged. */
export function setHoverTeam(teamId: string | null): void {
  if (hover.teamId === teamId) return;
  hover.teamId = teamId;
  wake();
}

/** Max pointer travel (px) between down and up for a press to count as a click. */
export const CLICK_SLOP_PX = 8;

/** Held movement keys, in screen space. */
export const keys = { up: false, down: false, left: false, right: false };

/** Timestamp of the last pinch, so the second finger lifting does not count as a floor tap. */
export const input = { lastPinchAt: 0 };

let wake: () => void = () => {};
let walkGrid: Grid | null = null;

/** Bound by the scene to R3F's invalidate(); requests one frame in demand mode. */
export function bindWake(fn: (() => void) | null): void {
  wake = fn ?? (() => {});
}

export function wakeScene(): void {
  wake();
}

export function setWalkGrid(grid: Grid): void {
  walkGrid = grid;
}

export function focusCeo(): void {
  focus.mode = "ceo";
  wake();
}

export function focusPoint(p: Point): void {
  focus.mode = "point";
  focus.x = p.x;
  focus.z = p.z;
  wake();
}

/**
 * Plans an A* route from the CEO's tile to `goal` and starts walking. Returns false (and leaves
 * the avatar where it is) when the goal is blocked or unreachable.
 */
export function walkToTile(goal: Tile): boolean {
  if (!walkGrid) return false;
  const route = findPath(walkGrid, tileOf(ceo.x, ceo.z), goal);
  if (!route) return false;
  ceo.path = route.slice(1).map(tileCenter);
  if (ceo.path.length === 0) ceo.path = [tileCenter(goal)];
  wake();
  return true;
}

/** Recent pinch → ignore the synthetic tap that follows it. */
export function isTapSuppressed(now = performance.now()): boolean {
  return now - input.lastPinchAt < 350;
}

export function getWalkGrid(): Grid | null {
  return walkGrid;
}

/** Throttled animation frame rate (typing, waving, blocked pulse): ~15 fps. */
export const TICK_MS = 66;
const tickSources = new Set<string>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Named reasons to keep rendering at TICK_MS. The interval exists only while at least one source
 * is on, and skips ticks while the tab is hidden, so an idle office schedules nothing.
 */
export function setTickSource(name: string, on: boolean): void {
  if (on) tickSources.add(name);
  else tickSources.delete(name);
  if (tickSources.size > 0 && tickTimer === null) {
    tickTimer = setInterval(() => {
      if (!document.hidden) wake();
    }, TICK_MS);
  } else if (tickSources.size === 0 && tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

export function isTicking(): boolean {
  return tickTimer !== null;
}
