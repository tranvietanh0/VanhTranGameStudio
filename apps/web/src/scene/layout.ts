import { blockRect, createGrid, setBlocked, type Grid, type Tile } from "./pathfinding";

/**
 * Office floor plan in tile units (1 tile = 1 world unit). Pure math, unit-tested.
 *
 *   x: 0..6 CEO room (glass walls on x=7 and z=7, glass door at DOOR_TILE), 8 main aisle,
 *      9.. team cells. Below the CEO room (z >= 8) is the lounge.
 *   The office entrance (where subagents arrive and leave) is in the back wall at ENTRANCE_TILE.
 *
 * Each team slot owns a CELL_W x CELL_D cell. Inside it a POD of six desks (two facing rows of
 * three) fills local x 1..3, z 1..4:
 *
 *   local z 0   aisle (north approach row)
 *   local z 1   north chairs  (seats face +z, towards the camera)
 *   local z 2-3 two rows of desks, back to back
 *   local z 4   south chairs  (seats face -z, monitor glow visible from the camera)
 *   local z 5   = next cell's z 0 (south approach row)
 *
 * Seat 0 is the team lead (south row, column 3, nearest the camera); seats 1..5 are for members.
 */
export const COLUMNS = 4;
export const CELL_W = 5;
export const CELL_D = 5;
export const MIN_ROWS = 3;
export const TEAM_ORIGIN: Readonly<Tile> = { x: 9, z: 1 };
export const CEO_ROOM = { x: 0, z: 0, w: 7, d: 7 } as const;
export const GLASS_X = 7;
export const GLASS_Z = 7;
/** Gap in the CEO room's glass wall. */
export const DOOR_TILE: Readonly<Tile> = { x: 7, z: 3 };
/** Office entrance in the back (z = 0) wall: members spawn and despawn here. */
export const ENTRANCE_TILE: Readonly<Tile> = { x: 8, z: 0 };
export const CEO_SPAWN = { x: 3.5, z: 4.5 } as const;

/** Desks per pod: one lead + MAX_MEMBER_SEATS members. */
export const SEATS_PER_POD = 6;
export const MAX_MEMBER_SEATS = SEATS_PER_POD - 1;
/** Pod footprint inside the cell (local tiles). */
export const POD = { x: 1, z: 1, w: 3, d: 4 } as const;
/** Local z of the chair centres and desk centres per row. */
/**
 * The chair stays on its approach-side tile (north row tile 1, south row tile 4) and its seat front
 * stays clear of the desk edge; the seated character's knees end just short of the desk.
 */
const ROW_Z = { north: { chair: 1.97, desk: 2.72 }, south: { chair: 4.03, desk: 3.28 } } as const;
/** Seat index → pod column (0..2) and row. Seat 0 = lead. */
const SEAT_SPOTS: ReadonlyArray<{ col: number; row: "north" | "south" }> = [
  { col: 2, row: "south" },
  { col: 0, row: "north" },
  { col: 1, row: "north" },
  { col: 2, row: "north" },
  { col: 0, row: "south" },
  { col: 1, row: "south" },
];

export interface Point {
  x: number;
  z: number;
}

export interface Seat {
  /** Where the seated character's hips go. */
  chair: Point;
  /** Character facing (radians, 0 = +z), looking at its desk. */
  yaw: number;
  /** Centre of the desk in front of the seat. */
  desk: Point;
  /** Free aisle tile from which the character steps into / out of the chair. */
  approach: Tile;
}

/**
 * Static furniture and decor. x/z/w/d are the tile footprint; the model is centred on it.
 * `kind` is a key of the furniture kit (office-kit.glb). `block: false` = walk-through (rugs).
 */
export interface Prop {
  kind: string;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Model rotation around y (radians). */
  yaw?: number;
  /** Lift above the floor (props standing on other props). */
  y?: number;
  /** Uniform scale override (defaults to the kit scale). */
  scale?: number;
  /** Optional colour override set name (see palette KIT_TINTS). */
  tint?: string;
  /** Stretch along the model's own x axis (counter units butted into one run). */
  sx?: number;
  block?: boolean;
}

export interface OfficeLayout {
  width: number;
  depth: number;
  rows: number;
  grid: Grid;
  props: Prop[];
}

/** Kitchen cabinet stretch so each unit fills exactly one tile (kit width 0.43 at KIT_SCALE 1.4). */
const COUNTER_SX = 1 / (0.43 * 1.4);

/** Slot → cell column/row. Slots are server-assigned and stable, so the mapping is too. */
export function slotCell(slot: number): { col: number; row: number } {
  const s = Number.isFinite(slot) && slot > 0 ? Math.floor(slot) : 0;
  return { col: s % COLUMNS, row: Math.floor(s / COLUMNS) };
}

export function cellOrigin(slot: number): Tile {
  const { col, row } = slotCell(slot);
  return { x: TEAM_ORIGIN.x + col * CELL_W, z: TEAM_ORIGIN.z + row * CELL_D };
}

/** Seat `index` (0 = lead, 1..5 = members) of the pod in `slot`. */
export function seatOf(slot: number, index: number): Seat {
  const spot = SEAT_SPOTS[Math.min(Math.max(0, Math.floor(index)), SEATS_PER_POD - 1)] ?? SEAT_SPOTS[0]!;
  const o = cellOrigin(slot);
  const x = o.x + POD.x + spot.col + 0.5;
  const z = ROW_Z[spot.row];
  const north = spot.row === "north";
  return {
    chair: { x, z: o.z + z.chair },
    yaw: north ? 0 : Math.PI,
    desk: { x, z: o.z + z.desk },
    approach: { x: o.x + POD.x + spot.col, z: north ? o.z : o.z + CELL_D },
  };
}

/** Centre of the whole pod: camera focus and team label anchor. */
export function deskCenter(slot: number): Point {
  const o = cellOrigin(slot);
  return { x: o.x + POD.x + POD.w / 2, z: o.z + POD.z + POD.d / 2 };
}

/** World position of the lead's chair. */
export function chairPosition(slot: number): Point {
  return seatOf(slot, 0).chair;
}

/** Free tile behind the lead's chair where the CEO stands to look over the lead's shoulder. */
export function approachTile(slot: number): Tile {
  return seatOf(slot, 0).approach;
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

export function officeSize(rows: number): { width: number; depth: number } {
  return { width: TEAM_ORIGIN.x + COLUMNS * CELL_W + 1, depth: TEAM_ORIGIN.z + rows * CELL_D + 1 };
}

/** Office depth from which the lounge strip also fits a meeting corner (five team rows). */
export const MEETING_MIN_DEPTH = 26;
/** Office depth from which the far end of the lounge strip gets a reading corner. */
const READING_MIN_DEPTH = 21;

/**
 * CEO room, then the strip under it (x 0..6) in zones from the back wall forward: lounge, coffee
 * corner, meeting corner (deep offices), reading corner. Positions are tiles; see the plan above.
 * Kinds without a kit model ("meetingTable", "whiteboard", "planter") are built procedurally by
 * officeBuild.
 */
function buildProps(width: number, depth: number): Prop[] {
  const props: Prop[] = [
    // CEO room
    { kind: "bookcaseWide", x: 0, z: 0, w: 2, d: 1 },
    { kind: "bookcase", x: 2, z: 0, w: 1, d: 1 },
    { kind: "plantTall", x: 6, z: 0, w: 1, d: 1 },
    { kind: "bossDesk", x: 2, z: 2, w: 3, d: 1, yaw: 0 },
    { kind: "chairDesk", x: 3, z: 1, w: 1, d: 1, yaw: Math.PI, tint: "boss" },
    { kind: "rugRound", x: 1, z: 3, w: 4, d: 3, block: false, tint: "ceoRug" },
    { kind: "designSofa", x: 0, z: 4, w: 1, d: 2, yaw: Math.PI / 2, tint: "sage" },
    { kind: "sideTable", x: 0, z: 6, w: 1, d: 1, yaw: Math.PI / 2 },
    { kind: "floorLamp", x: 6, z: 5, w: 1, d: 1 },
    { kind: "plantTall", x: 6, z: 6, w: 1, d: 1 },
    // Lounge: sofa backing onto the glass wall, armchair, coffee table.
    { kind: "rugRounded", x: 1, z: 8, w: 5, d: 4, block: false, tint: "loungeRug" },
    { kind: "sofa", x: 1, z: 8, w: 3, d: 1, yaw: 0 },
    { kind: "armchair", x: 5, z: 9, w: 1, d: 1, yaw: -Math.PI / 2, tint: "sage" },
    { kind: "armchair", x: 1, z: 11, w: 1, d: 1, yaw: Math.PI * 0.75 },
    { kind: "coffeeTable", x: 2, z: 10, w: 2, d: 1 },
    { kind: "floorLamp", x: 0, z: 8, w: 1, d: 1 },
    { kind: "plantTall", x: 6, z: 8, w: 1, d: 1 },
    // Coffee corner: a counter run against the left wall, fridge, a round bar table.
    { kind: "cabinet", x: 0, z: 13, w: 1, d: 1, yaw: Math.PI / 2, sx: COUNTER_SX },
    { kind: "cabinet", x: 0, z: 14, w: 1, d: 1, yaw: Math.PI / 2, sx: COUNTER_SX },
    { kind: "cabinet", x: 0, z: 15, w: 1, d: 1, yaw: Math.PI / 2, sx: COUNTER_SX },
    { kind: "fridge", x: 0, z: 16, w: 1, d: 1, yaw: Math.PI / 2 },
    { kind: "plantTall", x: 0, z: 12, w: 1, d: 1 },
    { kind: "tableRound", x: 3, z: 14, w: 1, d: 1 },
    { kind: "stool", x: 2, z: 14, w: 1, d: 1, yaw: Math.PI / 2 },
    { kind: "stool", x: 4, z: 14, w: 1, d: 1, yaw: -Math.PI / 2 },
    { kind: "stool", x: 3, z: 15, w: 1, d: 1, yaw: Math.PI },
    // Low planter divider between the lounge strip and the main aisle.
    { kind: "planter", x: 6, z: 13, w: 1, d: 3 },
    { kind: "trashcan", x: 5, z: 16, w: 1, d: 1 },
    // Office
    { kind: "doormat", x: 8, z: 0, w: 1, d: 1, block: false },
    { kind: "coatRack", x: 9, z: 0, w: 1, d: 1 },
    { kind: "plantTall", x: width - 1, z: 0, w: 1, d: 1 },
    { kind: "plantTall", x: width - 1, z: depth - 1, w: 1, d: 1 },
  ];
  if (depth >= MEETING_MIN_DEPTH) {
    props.push(
      { kind: "rugRect", x: 1, z: 18, w: 5, d: 4, block: false, tint: "sageRug" },
      { kind: "meetingTable", x: 3, z: 19, w: 1, d: 2 },
      { kind: "chairDesk", x: 2, z: 19, w: 1, d: 1, yaw: Math.PI / 2, tint: "member" },
      { kind: "chairDesk", x: 2, z: 20, w: 1, d: 1, yaw: Math.PI / 2, tint: "member" },
      { kind: "chairDesk", x: 4, z: 19, w: 1, d: 1, yaw: -Math.PI / 2, tint: "member" },
      { kind: "chairDesk", x: 4, z: 20, w: 1, d: 1, yaw: -Math.PI / 2, tint: "member" },
      { kind: "whiteboard", x: 0, z: 18, w: 1, d: 2, block: false },
      { kind: "planter", x: 6, z: 18, w: 1, d: 3 },
      { kind: "plantTall", x: 0, z: 17, w: 1, d: 1 },
    );
  }
  // A reading corner at the far end of the lounge strip when the office is deep enough.
  if (depth >= READING_MIN_DEPTH) {
    const z0 = depth >= MEETING_MIN_DEPTH ? depth - 4 : depth - 5;
    props.push(
      { kind: "rugRound", x: 1, z: z0, w: 4, d: 3, block: false, tint: "loungeRug" },
      { kind: "designSofa", x: 1, z: depth - 1, w: 3, d: 1, yaw: Math.PI, tint: "oat" },
      { kind: "designChair", x: 5, z: z0 + 1, w: 1, d: 2, yaw: -Math.PI / 2, tint: "sage" },
      { kind: "coffeeTable", x: 2, z: z0 + 1, w: 2, d: 1 },
      { kind: "bookcase", x: 0, z: z0, w: 1, d: 1, yaw: Math.PI / 2 },
      { kind: "bookcase", x: 0, z: z0 + 1, w: 1, d: 1, yaw: Math.PI / 2 },
      { kind: "floorLamp", x: 0, z: depth - 1, w: 1, d: 1 },
      { kind: "plantTall", x: 6, z: depth - 1, w: 1, d: 1 },
    );
  } else {
    props.push({ kind: "plantTall", x: 0, z: depth - 1, w: 1, d: 1 });
  }
  for (let c = 1; c < COLUMNS; c++) {
    const x = TEAM_ORIGIN.x + c * CELL_W - 1;
    props.push({ kind: c % 2 ? "plantTall" : "trashcan", x, z: 0, w: 1, d: 1 });
  }
  return props;
}

/** Builds the walk grid: glass walls (except the door), props, and the pods of occupied slots. */
export function buildOfficeLayout(slots: readonly number[]): OfficeLayout {
  const rows = rowsFor(slots);
  const { width, depth } = officeSize(rows);
  const grid = createGrid(width, depth);

  for (let z = 0; z <= GLASS_Z; z++) setBlocked(grid, GLASS_X, z);
  for (let x = 0; x <= GLASS_X; x++) setBlocked(grid, x, GLASS_Z);
  setBlocked(grid, DOOR_TILE.x, DOOR_TILE.z, false);

  const props = buildProps(width, depth);
  for (const p of props) if (p.block !== false) blockRect(grid, p.x, p.z, p.w, p.d);
  for (const slot of slots) {
    const o = cellOrigin(slot);
    blockRect(grid, o.x + POD.x, o.z + POD.z, POD.w, POD.d);
  }
  return { width, depth, rows, grid, props };
}
