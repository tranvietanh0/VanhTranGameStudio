import { isBlocked, type Grid } from "./pathfinding";
import type { Point } from "./layout";

/** CEO walk speed in tiles per second. */
export const WALK_SPEED = 3.2;
/** Collision radius of the avatar against grid obstacles. */
export const BODY_RADIUS = 0.24;

export interface PathStep {
  x: number;
  z: number;
  /** Remaining waypoints after this step. */
  path: Point[];
  /** Heading in radians (atan2(dx, dz)), or null when no movement happened. */
  heading: number | null;
}

/** Moves `dist` world units along the waypoint list, consuming waypoints as they are reached. */
export function advanceAlongPath(from: Point, path: readonly Point[], dist: number): PathStep {
  let x = from.x;
  let z = from.z;
  let left = dist;
  let heading: number | null = null;
  let i = 0;
  while (i < path.length && left > 0) {
    const wp = path[i] as Point;
    const dx = wp.x - x;
    const dz = wp.z - z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-6) heading = Math.atan2(dx, dz);
    if (len <= left) {
      x = wp.x;
      z = wp.z;
      left -= len;
      i++;
    } else {
      x += (dx / len) * left;
      z += (dz / len) * left;
      left = 0;
    }
  }
  return { x, z, path: path.slice(i), heading };
}

function hitsObstacle(grid: Grid, x: number, z: number, r: number): boolean {
  return (
    isBlocked(grid, Math.floor(x - r), Math.floor(z - r)) ||
    isBlocked(grid, Math.floor(x + r), Math.floor(z - r)) ||
    isBlocked(grid, Math.floor(x - r), Math.floor(z + r)) ||
    isBlocked(grid, Math.floor(x + r), Math.floor(z + r))
  );
}

/**
 * Free movement (keyboard) with axis-separated collision so the avatar slides along walls
 * instead of sticking. A move that would enter an obstacle on one axis keeps the other axis.
 */
export function stepWithCollision(grid: Grid, from: Point, dx: number, dz: number, r = BODY_RADIUS): Point {
  let x = from.x;
  let z = from.z;
  if (dx !== 0 && !hitsObstacle(grid, x + dx, z, r)) x += dx;
  if (dz !== 0 && !hitsObstacle(grid, x, z + dz, r)) z += dz;
  return { x, z };
}

/**
 * Converts held arrow/WASD directions into a world-space unit vector for the isometric camera
 * (yaw 45°): screen-up is world (-1, -1), screen-right is world (1, -1).
 */
export function screenToWorldDir(right: number, up: number): Point {
  const x = (right - up) * Math.SQRT1_2;
  const z = (-right - up) * Math.SQRT1_2;
  const len = Math.hypot(x, z);
  return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
}
