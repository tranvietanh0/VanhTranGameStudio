import type { BufferGeometry } from "three";
import { box, merge } from "./geometry";
import { CEO_ROOM, CELL, COLUMNS, DOOR_TILE, GLASS_X, GLASS_Z, TEAM_ORIGIN, type OfficeLayout } from "./layout";
import { PALETTE as P } from "./palette";
import { propParts } from "./props";

const WALL_H = 1.5;
const GLASS_H = 1.3;

/** Floor, rugs, plank lines: everything you can click to walk to. */
function floorParts(l: OfficeLayout): BufferGeometry[] {
  const { width, depth } = l;
  const parts = [box(width, 0.2, depth, P.floor, width / 2, -0.2, depth / 2)];
  for (let z = 1; z < depth; z++) parts.push(box(width, 0.004, 0.025, "#dcc19c", width / 2, 0, z));
  parts.push(box(CEO_ROOM.w + 1, 0.02, CEO_ROOM.d + 1, P.floorCeo, (CEO_ROOM.w + 1) / 2, 0, (CEO_ROOM.d + 1) / 2));
  parts.push(box(4, 0.012, 2.6, P.rugCeo, 3.5, 0.02, 4.6));
  const loungeD = depth - GLASS_Z - 2;
  if (loungeD > 1) parts.push(box(5.6, 0.012, loungeD, P.rugLounge, 3.5, 0, GLASS_Z + 1.5 + loungeD / 2));
  for (let row = 0; row < l.rows; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const x = TEAM_ORIGIN.x + col * CELL + CELL / 2;
      const z = TEAM_ORIGIN.z + row * CELL + CELL / 2;
      parts.push(box(3.5, 0.01, 3.5, (row + col) % 2 === 0 ? "#f4dcc0" : "#eadfcb", x, 0, z));
    }
  }
  return parts;
}

/** Low cut-away back walls (dollhouse): only the two walls away from the camera exist. */
function wallParts(l: OfficeLayout): BufferGeometry[] {
  const { width, depth } = l;
  const parts = [
    box(width + 0.2, WALL_H, 0.2, P.wall, width / 2 - 0.1, 0, -0.1),
    box(0.2, WALL_H, depth, P.wall, -0.1, 0, depth / 2),
    box(width + 0.24, 0.06, 0.26, P.wallTrim, width / 2 - 0.1, WALL_H, -0.1),
    box(0.26, 0.06, depth, P.wallTrim, -0.1, WALL_H, depth / 2),
    box(width, 0.12, 0.04, P.wallTrim, width / 2, 0, 0.02),
    box(0.04, 0.12, depth, P.wallTrim, 0.02, 0, depth / 2),
  ];
  for (let x = TEAM_ORIGIN.x + 1.5; x < width - 1; x += CELL) {
    parts.push(box(1.7, 0.78, 0.05, "#ffffff", x + 0.5, 0.5, 0.02), box(1.55, 0.66, 0.06, "#cfeaf6", x + 0.5, 0.56, 0.03));
    parts.push(box(0.04, 0.66, 0.07, "#ffffff", x + 0.5, 0.56, 0.03));
  }
  parts.push(box(0.05, 0.7, 1.8, "#ffffff", 0.03, 0.5, 12.5), box(0.02, 0.06, 1.6, "#7fa8c9", 0.07, 0.95, 12.3));
  parts.push(box(0.04, 0.5, 0.7, "#f2c14e", 0.03, 0.6, 2), box(0.05, 0.4, 0.6, "#a7c7e7", 0.04, 0.65, 2));
  parts.push(box(0.04, 0.5, 0.7, "#e7a08f", 0.03, 0.6, 4.4), box(0.05, 0.4, 0.6, "#b8e0b0", 0.04, 0.65, 4.4));
  return parts;
}

function isDoor(x: number, z: number): boolean {
  return x === DOOR_TILE.x && z === DOOR_TILE.z;
}

/** Glass wall tiles of the CEO room, door excluded. */
function glassTiles(): Array<{ x: number; z: number; alongZ: boolean }> {
  const tiles: Array<{ x: number; z: number; alongZ: boolean }> = [];
  for (let z = 0; z < GLASS_Z; z++) if (!isDoor(GLASS_X, z)) tiles.push({ x: GLASS_X, z, alongZ: true });
  for (let x = 0; x <= GLASS_X; x++) if (!isDoor(x, GLASS_Z)) tiles.push({ x, z: GLASS_Z, alongZ: false });
  return tiles;
}

function glassFrameParts(): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  for (const t of glassTiles()) {
    const cx = t.x + 0.5;
    const cz = t.z + 0.5;
    if (t.alongZ) {
      parts.push(box(0.1, 0.08, 1, P.glassFrame, cx, 0, cz), box(0.08, 0.05, 1, P.glassFrame, cx, GLASS_H, cz));
      parts.push(box(0.07, GLASS_H, 0.07, P.glassFrame, cx, 0, t.z));
    } else {
      parts.push(box(1, 0.08, 0.1, P.glassFrame, cx, 0, cz), box(1, 0.05, 0.08, P.glassFrame, cx, GLASS_H, cz));
      parts.push(box(0.07, GLASS_H, 0.07, P.glassFrame, t.x, 0, cz));
    }
  }
  const dz = DOOR_TILE.z;
  parts.push(box(0.09, GLASS_H + 0.05, 0.09, P.glassFrame, GLASS_X + 0.5, 0, dz));
  parts.push(box(0.12, 0.08, 1.06, P.glassFrame, GLASS_X + 0.5, GLASS_H, dz + 0.5));
  return parts;
}

/** The entire static office (floor, walls, frames, props) as one geometry = one draw call. */
export function buildStaticGeometry(l: OfficeLayout): BufferGeometry {
  return merge([...floorParts(l), ...wallParts(l), ...glassFrameParts(), ...l.props.flatMap(propParts)]);
}

/** Transparent glass panes as a second geometry (one more draw call). */
export function buildGlassGeometry(): BufferGeometry {
  return merge(
    glassTiles().map((t) =>
      t.alongZ
        ? box(0.04, GLASS_H - 0.08, 0.96, P.glass, t.x + 0.5, 0.08, t.z + 0.5)
        : box(0.96, GLASS_H - 0.08, 0.04, P.glass, t.x + 0.5, 0.08, t.z + 0.5),
    ),
  );
}
