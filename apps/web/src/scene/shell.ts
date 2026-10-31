import { Vector3 } from "three";
import type { Tile } from "./pathfinding";
import type { MeshBuilder } from "./meshBuilder";
import { CEO_ROOM, GLASS_X, GLASS_Z } from "./layout";
import { PALETTE } from "./palette";

/** Back walls (x = 0 and z = 0 planes); the camera looks at the room from +x/+z so these stay visible. */
export const WALL_HEIGHT = 2.3;
const WALL_T = 0.25;
const PANEL_TOP = 0.9;
const RAIL_TOP = 0.97;
const WIN_Y0 = 1.0;
const WIN_Y1 = 2.0;
const DOOR_H = 1.65;

interface Opening {
  /** Centre along the wall axis. */
  c: number;
  w: number;
  y0: number;
  y1: number;
  kind: "window" | "door";
}

/** Centres of the big office windows along the back (x) or left (z) wall, every 5 tiles. */
export function windowCentres(axis: "x" | "z", length: number): number[] {
  const out: number[] = [];
  for (let c = axis === "x" ? 11.5 : 11; c + 1.2 < length; c += 5) out.push(c);
  return out;
}

/** Small deterministic PRNG so the plank pattern is identical on every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/** Wood planks running along `axis`, clipped to [x0,x1] x [z0,z1]. */
function planks(b: MeshBuilder, x0: number, z0: number, x1: number, z1: number, axis: "x" | "z", base: string, seed: number): void {
  const rnd = mulberry32(seed);
  const W = 0.5;
  const gap = 0.022;
  const [a0, a1, c0, c1] = axis === "x" ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
  for (let c = c0; c < c1 - 1e-6; c += W) {
    let a = a0 - rnd() * 1.8;
    while (a < a1) {
      const len = 1.4 + rnd() * 1.6;
      const s = Math.max(a, a0);
      const t = Math.min(a + len, a1);
      if (t - s > 0.05) {
        const col = shade(base, 0.955 + rnd() * 0.08);
        const cTop = Math.min(c + W, c1);
        const [px0, pz0, px1, pz1] = axis === "x" ? [s + gap, c + gap, t - gap, cTop - gap] : [c + gap, s + gap, cTop - gap, t - gap];
        b.addQuad(new Vector3(px0, 0, pz1), new Vector3(px1, 0, pz1), new Vector3(px1, 0, pz0), new Vector3(px0, 0, pz0), col);
      }
      a += len;
    }
  }
}

/** Layered wall piece between a0..a1 along the wall and ya..yb in height (wainscot, rail, plaster). */
function wallPiece(b: MeshBuilder, axis: "x" | "z", a0: number, a1: number, ya: number, yb: number): void {
  const layers: Array<[number, number, string, number]> = [
    [0, PANEL_TOP, PALETTE.wallPanel, 0.03],
    [PANEL_TOP, RAIL_TOP, PALETTE.wallTrim, 0.06],
    [RAIL_TOP, WALL_HEIGHT, PALETTE.wall, 0],
  ];
  for (const [l0, l1, color, proud] of layers) {
    const y0 = Math.max(ya, l0);
    const y1 = Math.min(yb, l1);
    if (y1 - y0 < 1e-4) continue;
    if (axis === "x") b.addBox(a0, y0, -WALL_T, a1, y1, proud, color);
    else b.addBox(-WALL_T, y0, a0, proud, y1, a1, color);
  }
}

function frameBox(b: MeshBuilder, axis: "x" | "z", a0: number, a1: number, y0: number, y1: number, depth0: number, depth1: number, color: string): void {
  if (axis === "x") b.addBox(a0, y0, depth0, a1, y1, depth1, color);
  else b.addBox(depth0, y0, a0, depth1, y1, a1, color);
}

function windowAt(b: MeshBuilder, glow: MeshBuilder, axis: "x" | "z", o: Opening): void {
  const a0 = o.c - o.w / 2;
  const a1 = o.c + o.w / 2;
  const f = 0.07;
  const inner = -0.12;
  // Sky pane (unlit), recessed in the wall.
  const P = (a: number, y: number) => (axis === "x" ? new Vector3(a, y, inner) : new Vector3(inner, y, a));
  const cols = [PALETTE.skyBottom, PALETTE.skyBottom, PALETTE.skyTop, PALETTE.skyTop] as const;
  if (axis === "x") glow.addQuad(P(a0, o.y0), P(a1, o.y0), P(a1, o.y1), P(a0, o.y1), cols);
  else glow.addQuad(P(a1, o.y0), P(a0, o.y0), P(a0, o.y1), P(a1, o.y1), cols);
  // Frame, mullions and sill.
  frameBox(b, axis, a0 - f, a1 + f, o.y1, o.y1 + f, inner, 0.04, PALETTE.windowFrame);
  frameBox(b, axis, a0 - f, a0, o.y0, o.y1, inner, 0.04, PALETTE.windowFrame);
  frameBox(b, axis, a1, a1 + f, o.y0, o.y1, inner, 0.04, PALETTE.windowFrame);
  frameBox(b, axis, o.c - 0.025, o.c + 0.025, o.y0, o.y1, inner, -0.08, PALETTE.windowFrame);
  frameBox(b, axis, a0, a1, (o.y0 + o.y1) / 2 + 0.12, (o.y0 + o.y1) / 2 + 0.16, inner, -0.08, PALETTE.windowFrame);
  frameBox(b, axis, a0 - f - 0.05, a1 + f + 0.05, o.y0 - 0.06, o.y0, inner, 0.14, PALETTE.windowFrame);
}

function doorAt(b: MeshBuilder, glow: MeshBuilder, o: Opening): void {
  const a0 = o.c - o.w / 2;
  const a1 = o.c + o.w / 2;
  const f = 0.08;
  glow.addQuad(new Vector3(a0, 0, -WALL_T + 0.01), new Vector3(a1, 0, -WALL_T + 0.01), new Vector3(a1, o.y1, -WALL_T + 0.01), new Vector3(a0, o.y1, -WALL_T + 0.01), "#f3e2c4");
  b.addBox(a0 - f, 0, -WALL_T, a0, o.y1 + f, 0.05, PALETTE.wallTrim);
  b.addBox(a1, 0, -WALL_T, a1 + f, o.y1 + f, 0.05, PALETTE.wallTrim);
  b.addBox(a0 - f, o.y1, -WALL_T, a1 + f, o.y1 + f, 0.05, PALETTE.wallTrim);
  // Door leaf swung open against the wall.
  b.addBox(a1 + f, 0.02, 0.05, a1 + f + o.w * 0.95, o.y1 - 0.03, 0.11, PALETTE.door);
  b.addBox(a1 + f + o.w * 0.8, 0.8, 0.11, a1 + f + o.w * 0.86, 0.86, 0.16, "#e8d9a8");
}

function buildWall(b: MeshBuilder, glow: MeshBuilder, axis: "x" | "z", length: number, openings: Opening[]): void {
  const sorted = [...openings].sort((p, q) => p.c - q.c);
  let a = -WALL_T;
  for (const o of sorted) {
    const a0 = o.c - o.w / 2;
    const a1 = o.c + o.w / 2;
    wallPiece(b, axis, a, a0, 0, WALL_HEIGHT);
    if (o.y0 > 0) wallPiece(b, axis, a0, a1, 0, o.y0);
    wallPiece(b, axis, a0, a1, o.y1, WALL_HEIGHT);
    if (o.kind === "window") windowAt(b, glow, axis, o);
    else doorAt(b, glow, o);
    a = a1;
  }
  wallPiece(b, axis, a, length, 0, WALL_HEIGHT);
  // Cap along the top, darker so the wall edge reads from above.
  frameBox(b, axis, -WALL_T, length, WALL_HEIGHT, WALL_HEIGHT + 0.05, -WALL_T - 0.02, 0.02, PALETTE.wallCap);
}

/**
 * Floor (wood planks over a darker base so the seams read), the two back walls with windows,
 * baseboards, and the entrance door. Pure geometry; everything lands in the given builders.
 */
export function buildShell(solid: MeshBuilder, glow: MeshBuilder, width: number, depth: number, entrance: Tile): void {
  // Seam colour under the planks; extends under the walls.
  solid.addBox(-WALL_T, -0.08, -WALL_T, width, -0.004, depth, PALETTE.floorGap, { top: PALETTE.floorGap });
  const ceoX = GLASS_X + 0.5;
  const ceoZ = GLASS_Z + 0.5;
  planks(solid, 0, 0, ceoX, ceoZ, "z", PALETTE.floorCeo, 7);
  planks(solid, ceoX, 0, width, depth, "x", PALETTE.floorPlank, 11);
  planks(solid, 0, ceoZ, ceoX, depth, "x", PALETTE.floorPlank, 13);

  const xOpenings: Opening[] = [
    { c: CEO_ROOM.x + 4.5, w: 1.8, y0: WIN_Y0, y1: WIN_Y1, kind: "window" },
    { c: entrance.x + 0.5, w: 0.9, y0: 0, y1: DOOR_H, kind: "door" },
  ];
  for (const x of windowCentres("x", width)) xOpenings.push({ c: x, w: 2.2, y0: WIN_Y0, y1: WIN_Y1, kind: "window" });
  const zOpenings: Opening[] = [{ c: 3.0, w: 1.8, y0: WIN_Y0, y1: WIN_Y1, kind: "window" }];
  for (const z of windowCentres("z", depth)) zOpenings.push({ c: z, w: 2.2, y0: WIN_Y0, y1: WIN_Y1, kind: "window" });

  buildWall(solid, glow, "x", width, xOpenings);
  buildWall(solid, glow, "z", depth, zOpenings);
}
