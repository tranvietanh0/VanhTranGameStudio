import { blockRect, createGrid, setBlocked, type Grid, type Tile } from "./pathfinding";

/**
 * Office floor plan in tile units (1 tile = 1 world unit). Pure math, unit-tested.
 *
 *   x: 0..6 CEO room (glass walls on x=7 and z=7, door at DOOR_TILE), 8 aisle, 9.. team cells
 *   z: below the CEO room (z >= 8) is the lounge.
 * Each team slot owns a CELL x CELL block: desk at local (1..2, 1), chair at local (1..2, 2);
 * local row 0/3 and column 0/3 stay free, so neighbouring cells form 2-tile aisles.
 */
export const COLUMNS = 4;
export const CELL = 4;
export const MIN_ROWS = 4;
export const TEAM_ORIGIN: Readonly<Tile> = { x: 9, z: 1 };
export const CEO_ROOM = { x: 0, z: 0, w: 7, d: 7 } as const;
export const GLASS_X = 7;
export const GLASS_Z = 7;
export const DOOR_TILE: Readonly<Tile> = { x: 7, z: 3 };
export const CEO_SPAWN = { x: 3.5, z: 4.5 } as const;

export type PropKind = "plant" | "sofa" | "bookshelf" | "bossDesk" | "bossChair" | "coffeeTable" | "cooler";

/** Static furniture. x/z/w/d are the tile footprint; every prop is an obstacle. */
export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface OfficeLayout {
  width: number;
  depth: number;
  rows: number;
  grid: Grid;
  props: Prop[];
}

export interface Point {
  x: number;
  z: number;
}

/** Slot → cell column/row. Slots are server-assigned and stable, so the mapping is too. */
export function slotCell(slot: number): { col: number; row: number } {
  const s = Number.isFinite(slot) && slot > 0 ? Math.floor(slot) : 0;
  return { col: s % COLUMNS, row: Math.floor(s / COLUMNS) };
}

export function cellOrigin(slot: number): Tile {
  const { col, row } = slotCell(slot);
  return { x: TEAM_ORIGIN.x + col * CELL, z: TEAM_ORIGIN.z + row * CELL };
}

/** World centre of the desk top (desk spans local x 1..3, z 1..2). */
export function deskCenter(slot: number): Point {
  const o = cellOrigin(slot);
  return { x: o.x + 2, z: o.z + 1.5 };
}

/** World position of the lead's chair; the seated lead faces -z (towards the monitor). */
export function chairPosition(slot: number): Point {
  const o = cellOrigin(slot);
  return { x: o.x + 2, z: o.z + 2.45 };
}

/** Free tile behind the chair where the CEO stands to look over the lead's shoulder. */
export function approachTile(slot: number): Tile {
  const o = cellOrigin(slot);
  return { x: o.x + 2, z: o.z + 3 };
}

export function tileCenter(tile: Tile): Point {
  return { x: tile.x + 0.5, z: tile.z + 0.5 };
}

export function tileOf(x: number, z: number): Tile {
  return { x: Math.floor(x), z: Math.floor(z) };
}

export function rowsFor(slots: readonly number[]): number {
  let maxRow = -1;
  for (const s of slots) maxRow = Math.max(maxRow, slotCell(s).row);
  return Math.max(MIN_ROWS, maxRow + 1);
}

function buildProps(width: number, depth: number): Prop[] {
  return [
    { kind: "bookshelf", x: 0, z: 0, w: 2, d: 1 },
    { kind: "plant", x: 6, z: 0, w: 1, d: 1 },
    { kind: "bossDesk", x: 2, z: 2, w: 3, d: 1 },
    { kind: "bossChair", x: 3, z: 1, w: 1, d: 1 },
    { kind: "plant", x: 0, z: 6, w: 1, d: 1 },
    { kind: "sofa", x: 1, z: 9, w: 4, d: 1 },
    { kind: "coffeeTable", x: 2, z: 11, w: 2, d: 1 },
    { kind: "cooler", x: 6, z: 9, w: 1, d: 1 },
    { kind: "plant", x: 0, z: depth - 1, w: 1, d: 1 },
    { kind: "plant", x: 6, z: depth - 1, w: 1, d: 1 },
    { kind: "plant", x: width - 1, z: 0, w: 1, d: 1 },
    { kind: "plant", x: width - 1, z: depth - 1, w: 1, d: 1 },
  ];
}

/** Builds the walk grid: glass walls (except the door), props, and the desks of occupied slots. */
export function buildOfficeLayout(slots: readonly number[]): OfficeLayout {
  const rows = rowsFor(slots);
  const width = TEAM_ORIGIN.x + COLUMNS * CELL;
  const depth = TEAM_ORIGIN.z + rows * CELL;
  const grid = createGrid(width, depth);

  for (let z = 0; z <= GLASS_Z; z++) setBlocked(grid, GLASS_X, z);
  for (let x = 0; x <= GLASS_X; x++) setBlocked(grid, x, GLASS_Z);
  setBlocked(grid, DOOR_TILE.x, DOOR_TILE.z, false);

  const props = buildProps(width, depth);
  for (const p of props) blockRect(grid, p.x, p.z, p.w, p.d);
  for (const slot of slots) {
    const o = cellOrigin(slot);
    blockRect(grid, o.x + 1, o.z + 1, 2, 2);
  }
  return { width, depth, rows, grid, props };
}
