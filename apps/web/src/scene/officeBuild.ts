import { BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { KIT_SCALE, type Kit } from "./kit";
import { cellOrigin, DOOR_TILE, ENTRANCE_TILE, GLASS_X, GLASS_Z, MEETING_MIN_DEPTH, seatOf, SEATS_PER_POD, type OfficeLayout, type Prop, type Seat } from "./layout";
import { MeshBuilder } from "./meshBuilder";
import { PALETTE } from "./palette";
import { buildShell, WALL_HEIGHT, windowCentres } from "./shell";

/** Desk height after the kit's desk is squashed to suit the chibi characters. */
const DESK_SY = 0.72;
export const DESK_TOP_Y = 0.384 * KIT_SCALE * DESK_SY;
const MONITOR_SCALE = KIT_SCALE * 0.8;
/**
 * Office chair scale, and how far its centre sits BEHIND the seated character's root: the chibi
 * torso extends ~0.2 behind the root, so the backrest (front face 0.095 kit units behind the chair
 * centre) must start behind that, never through the body.
 */
export const CHAIR_SCALE = KIT_SCALE * 0.9;
const CHAIR_BACK = 0.1;
/** Kenney computerScreen: 0.393 x 0.294 x 0.104 kit units; the panel is the front ~0.03. */
const MONITOR = { w: 0.393 * MONITOR_SCALE, h: 0.294 * MONITOR_SCALE, d: 0.104 * MONITOR_SCALE };

export interface OfficeGeometry {
  solid: BufferGeometry;
  glow: BufferGeometry;
  glass: BufferGeometry;
}

const m = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const pos = new Vector3();
const scl = new Vector3();

interface PlaceOpts {
  yaw?: number;
  y?: number;
  s?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  tint?: string;
}

class Placer {
  readonly solid = new MeshBuilder();
  readonly glow = new MeshBuilder();
  readonly glass = new MeshBuilder();
  constructor(private readonly kit: Kit) {}

  place(key: string, x: number, z: number, o: PlaceOpts = {}): void {
    const t = this.kit.template(key, o.tint);
    const s = o.s ?? KIT_SCALE;
    m.compose(pos.set(x, o.y ?? 0, z), q.setFromEuler(e.set(0, o.yaw ?? 0, 0)), scl.set(s * (o.sx ?? 1), s * (o.sy ?? 1), s * (o.sz ?? 1)));
    if (t.solid) this.solid.addGeometry(t.solid, m);
    if (t.glow) this.glow.addGeometry(t.glow, m);
    if (t.glass) this.glass.addGeometry(t.glass, m);
  }

  /** Stretches a flat model (rug) over a tile rectangle. */
  fit(key: string, x0: number, z0: number, x1: number, z1: number, tint?: string): void {
    const t = this.kit.template(key, tint);
    this.place(key, (x0 + x1) / 2, (z0 + z1) / 2, { s: 1, sx: (x1 - x0) / t.size.x, sy: 1, sz: (z1 - z0) / t.size.z, y: 0.004, tint });
  }
}

/** Meeting table: oak top on four square legs, filling the prop's footprint minus a margin. */
function meetingTable(b: MeshBuilder, prop: Prop): void {
  const m = 0.12;
  const [x0, z0, x1, z1] = [prop.x + m, prop.z + m, prop.x + prop.w - m, prop.z + prop.d - m];
  const top = DESK_TOP_Y / DESK_SY;
  b.addBox(x0, top - 0.05, z0, x1, top, z1, PALETTE.meetingTable);
  const l = 0.06;
  for (const [x, z] of [[x0 + 0.05, z0 + 0.05], [x1 - 0.05 - l, z0 + 0.05], [x0 + 0.05, z1 - 0.05 - l], [x1 - 0.05 - l, z1 - 0.05 - l]] as const) {
    b.addBox(x, 0, z, x + l, top - 0.05, z + l, "#9c7652");
  }
}

/** Whiteboard on the left (x = 0) wall with a frame, a marker tray and a few sticky notes. */
function whiteboard(b: MeshBuilder, prop: Prop): void {
  const [z0, z1, y0, y1] = [prop.z + 0.15, prop.z + prop.d - 0.15, 0.95, 1.75];
  const f = 0.04;
  b.addBox(0, y0 - f, z0 - f, 0.05, y1 + f, z1 + f, "#b9b3a8");
  b.addBox(0, y0, z0, 0.065, y1, z1, PALETTE.whiteboard);
  b.addBox(0, y0 - 0.06, z0 + 0.1, 0.12, y0 - 0.03, z1 - 0.1, "#b9b3a8");
  const notes = ["#f3d27a", "#e9a98f", "#a9c79a", "#f3d27a", "#9fc0d9"];
  notes.forEach((c, i) => {
    const z = z0 + 0.18 + i * 0.24;
    const y = 1.45 - (i % 2) * 0.22;
    b.addBox(0.065, y, z, 0.072, y + 0.13, z + 0.13, c);
  });
  // A couple of marker strokes.
  b.addBox(0.065, 1.12, z0 + 0.25, 0.07, 1.14, z1 - 0.4, "#6f93b0");
  b.addBox(0.065, 1.2, z0 + 0.25, 0.07, 1.22, z1 - 0.7, "#c9765c");
}

/** Long wooden planter box with a row of leafy shrubs, used as a low room divider. */
function planter(p: Placer, prop: Prop): void {
  const m = 0.18;
  const [x0, z0, x1, z1] = [prop.x + m, prop.z + 0.08, prop.x + prop.w - m, prop.z + prop.d - 0.08];
  const h = 0.36;
  p.solid.addBox(x0, 0, z0, x1, h, z1, PALETTE.planter);
  p.solid.addBox(x0 - 0.03, h, z0 - 0.03, x1 + 0.03, h + 0.04, z1 + 0.03, PALETTE.wallTrim);
  p.solid.addBox(x0 + 0.04, h, z0 + 0.04, x1 - 0.04, h + 0.05, z1 - 0.04, PALETTE.soil);
  const kinds = ["plantSmall1", "plantSmall2", "plantSmall3"] as const;
  const n = Math.max(2, Math.round((z1 - z0) / 0.42));
  for (let i = 0; i < n; i++) {
    const z = z0 + ((i + 0.5) * (z1 - z0)) / n;
    p.place(kinds[i % kinds.length]!, (x0 + x1) / 2, z, { y: h + 0.02, yaw: i * 1.7, s: KIT_SCALE * (3.2 + (i % 2) * 0.6) });
  }
}

/** Shelf heights and book slots (kit units) of the bookcases, measured from office-kit.glb. */
const SHELVES: Record<string, { ys: readonly number[]; slots: readonly number[] }> = {
  bookcase: { ys: [0.13, 0.37, 0.61], slots: [-0.13, 0.12] },
  bookcaseWide: { ys: [0.07, 0.31, 0.55], slots: [-0.27, -0.1, 0.09, 0.27] },
};

/** Rows of books on a bookcase, with a gap here and there so it reads as lived-in. */
function fillBookcase(p: Placer, prop: Prop, seed: number): void {
  const shelves = SHELVES[prop.kind];
  if (!shelves) return;
  const yaw = prop.yaw ?? 0;
  const cx = prop.x + prop.w / 2;
  const cz = prop.z + prop.d / 2;
  const along = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  shelves.ys.forEach((y, shelf) => {
    shelves.slots.forEach((off, k) => {
      if ((seed + shelf * 2 + k) % 5 === 3) return;
      const o = off * KIT_SCALE;
      p.place("books", cx + along.x * o, cz + along.z * o, { y: y * KIT_SCALE, yaw: yaw + ((shelf + k) % 2) * Math.PI });
    });
  });
}

function placeProp(p: Placer, prop: Prop): void {
  if (prop.kind === "planter") return planter(p, prop);
  if (prop.kind === "meetingTable") return meetingTable(p.solid, prop);
  if (prop.kind === "whiteboard") return whiteboard(p.solid, prop);
  if (prop.kind.startsWith("rug") || prop.kind === "doormat") {
    const inset = prop.kind === "doormat" ? 0.15 : 0.1;
    p.fit(prop.kind, prop.x + inset, prop.z + inset, prop.x + prop.w - inset, prop.z + prop.d - inset, prop.tint);
    return;
  }
  p.place(prop.kind, prop.x + prop.w / 2, prop.z + prop.d / 2, { yaw: prop.yaw, y: prop.y, s: prop.scale, sx: prop.sx, tint: prop.tint });
}

/**
 * Soft daylight patches on the floor under each window: faint warm quads in the glass pass (same
 * draw call), fading out into the room.
 */
function windowLight(glass: MeshBuilder, width: number, depth: number): void {
  const V = (x: number, z: number) => new Vector3(x, 0.006, z);
  const warm = "#fff6dc";
  const floor = "#e9d2ad";
  const reach = 1.6;
  for (const c of windowCentres("x", width)) {
    const [a0, a1] = [c - 1.1, c + 1.1];
    glass.addQuad(V(a0 + 0.5, reach), V(a1 + 0.9, reach), V(a1, 0.05), V(a0, 0.05), [floor, floor, warm, warm]);
  }
  for (const c of windowCentres("z", depth)) {
    const [a0, a1] = [c - 1.1, c + 1.1];
    glass.addQuad(V(0.05, a0), V(0.05, a1), V(reach, a1 + 0.9), V(reach, a0 + 0.5), [warm, warm, floor, floor]);
  }
}

function forward(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

function placeSeat(p: Placer, seat: Seat, lead: boolean, index: number): void {
  const f = forward(seat.yaw);
  p.place("chairDesk", seat.chair.x - f.x * CHAIR_BACK, seat.chair.z - f.z * CHAIR_BACK, { yaw: seat.yaw, tint: lead ? "lead" : "member", s: CHAIR_SCALE });
  p.place("desk", seat.desk.x, seat.desk.z, { yaw: seat.yaw + Math.PI, sx: 0.95, sy: DESK_SY });
  p.place("monitor", seat.desk.x + f.x * 0.1, seat.desk.z + f.z * 0.1, { yaw: seat.yaw + Math.PI, y: DESK_TOP_Y, s: MONITOR_SCALE });
  p.place("keyboard", seat.desk.x - f.x * 0.13, seat.desk.z - f.z * 0.13, { yaw: seat.yaw + Math.PI, y: DESK_TOP_Y });
  const side = { x: Math.cos(seat.yaw), z: -Math.sin(seat.yaw) };
  if (lead) {
    p.place("deskLamp", seat.desk.x + side.x * 0.36, seat.desk.z + side.z * 0.36, { yaw: seat.yaw + Math.PI, y: DESK_TOP_Y, s: KIT_SCALE * 0.9 });
  } else if (index === 1) {
    p.place("plantSmall1", seat.desk.x - side.x * 0.36, seat.desk.z - side.z * 0.36, { y: DESK_TOP_Y, s: KIT_SCALE * 1.4 });
  } else if (index === 5) {
    p.place("books", seat.desk.x - side.x * 0.36, seat.desk.z - side.z * 0.36, { y: DESK_TOP_Y, yaw: 0.4 });
  }
}

function placePod(p: Placer, slot: number): void {
  const o = cellOrigin(slot);
  p.fit("rugRect", o.x + 0.75, o.z + 1.0, o.x + 4.25, o.z + 4.65, `pod${slot % PALETTE.podRugs.length}`);
  for (let i = 0; i < SEATS_PER_POD; i++) placeSeat(p, seatOf(slot, i), i === 0, i);
}

/** Glass walls of the CEO room: panes, slim frame posts and a top rail; gap at the door. */
function buildGlassRoom(p: Placer): void {
  const top = 1.9;
  const t = 0.05;
  const gx = GLASS_X + 0.5;
  const gz = GLASS_Z + 0.5;
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const doorZ0 = DOOR_TILE.z;
  const doorZ1 = DOOR_TILE.z + 1;
  const runs: Array<[number, number]> = [[0, doorZ0], [doorZ1, gz]];
  for (const [z0, z1] of runs) {
    p.glass.addQuad(V(gx, 0.06, z1), V(gx, 0.06, z0), V(gx, top, z0), V(gx, top, z1), PALETTE.glass);
    p.glass.addQuad(V(gx, 0.06, z0), V(gx, 0.06, z1), V(gx, top, z1), V(gx, top, z0), PALETTE.glass);
    p.solid.addBox(gx - t, top, z0, gx + t, top + 0.08, z1, PALETTE.glassFrame);
    p.solid.addBox(gx - t, 0, z0, gx + t, 0.06, z1, PALETTE.glassFrame);
    for (let z = z0; z <= z1 + 1e-6; z += (z1 - z0) / Math.max(1, Math.round((z1 - z0) / 1.25))) {
      p.solid.addBox(gx - t, 0, z - t, gx + t, top, z + t, PALETTE.glassFrame);
    }
  }
  p.glass.addQuad(V(0, 0.06, gz), V(gx, 0.06, gz), V(gx, top, gz), V(0, top, gz), PALETTE.glass);
  p.glass.addQuad(V(gx, 0.06, gz), V(0, 0.06, gz), V(0, top, gz), V(gx, top, gz), PALETTE.glass);
  p.solid.addBox(0, top, gz - t, gx + t, top + 0.08, gz + t, PALETTE.glassFrame);
  p.solid.addBox(0, 0, gz - t, gx + t, 0.06, gz + t, PALETTE.glassFrame);
  for (let i = 0; i <= 6; i++) {
    const x = (gx * i) / 6;
    p.solid.addBox(x - t, 0, gz - t, x + t, top, gz + t, PALETTE.glassFrame);
  }
}

/**
 * Bakes the whole static office (shell, CEO room, lounge, every occupied pod) into three merged
 * geometries: lit solid, unlit glow (windows, lamp shades) and transparent glass.
 * Depends on the occupied slots only, never on status or members.
 */
export function buildOfficeGeometry(kit: Kit, layout: OfficeLayout, slots: readonly number[]): OfficeGeometry {
  const p = new Placer(kit);
  buildShell(p.solid, p.glow, layout.width, layout.depth, ENTRANCE_TILE);
  buildGlassRoom(p);
  windowLight(p.glass, layout.width, layout.depth);
  layout.props.forEach((prop, i) => {
    placeProp(p, prop);
    fillBookcase(p, prop, i);
  });
  // Bits standing on other props.
  const counterTop = 0.45 * KIT_SCALE;
  p.place("coffeeMachine", 0.45, 13.5, { yaw: Math.PI / 2, y: counterTop });
  p.place("plantSmall2", 0.45, 14.2, { y: counterTop, s: KIT_SCALE * 1.6 });
  p.place("books", 0.45, 15.5, { y: counterTop, yaw: 1.2 });
  p.place("laptop", 3.5, 2.5, { yaw: 0, y: DESK_TOP_Y / DESK_SY });
  p.place("deskLamp", 4.4, 2.4, { yaw: 0, y: DESK_TOP_Y / DESK_SY });
  p.place("radio", 3.4, 10.5, { yaw: 0.3, y: 0.23 * KIT_SCALE });
  p.place("plantSmall1", 3.5, 14.5, { y: 0.367 * KIT_SCALE, s: KIT_SCALE * 1.5 });
  if (layout.depth >= MEETING_MIN_DEPTH) {
    p.place("laptop", 3.5, 19.6, { yaw: Math.PI / 2, y: DESK_TOP_Y / DESK_SY });
  }
  for (const slot of slots) placePod(p, slot);
  return { solid: p.solid.build(), glow: p.glow.build(), glass: p.glass.build() };
}

/** Matrix of the glowing screen quad (unit plane facing +z) on the monitor of `seat`. */
export function screenMatrix(seat: Seat, out: Matrix4): Matrix4 {
  const f = forward(seat.yaw);
  // Monitor faces the seat (yaw + PI); its front panel sits on the seat side of the model.
  const mx = seat.desk.x + f.x * 0.1;
  const mz = seat.desk.z + f.z * 0.1;
  const toward = -(MONITOR.d / 2) - 0.006;
  return out.compose(
    pos.set(mx + f.x * toward, DESK_TOP_Y + MONITOR.h * 0.6, mz + f.z * toward),
    q.setFromEuler(e.set(0, seat.yaw + Math.PI, 0)),
    scl.set(MONITOR.w * 0.86, MONITOR.h * 0.6, 1),
  );
}

export { WALL_HEIGHT };
