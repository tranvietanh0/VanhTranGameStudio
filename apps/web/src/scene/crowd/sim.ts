import { Matrix4, Sphere, Vector3, type Frustum, type Group } from "three";
import type { AgentStatus } from "@studio/shared";
import { advanceAlongPath } from "../ceoMotion";
import { ENTRANCE_TILE, seatOf, tileCenter, tileOf, type Point } from "../layout";
import { hashString } from "../palette";
import { findPath, type Grid, type Tile } from "../pathfinding";
import { ceo } from "../runtime";
import { BlobShadows, VariantBucket } from "./buckets";
import type { ActorSpec } from "./plan";
import { LOOPING, Puppet } from "./puppet";
import type { CharacterLibrary, ClipName } from "./rig";

/** Members walk a bit slower than the CEO. */
export const MEMBER_SPEED = 2.4;
/** Height of the character origin when seated on an office chair. */
export const SEAT_Y = 0.3;
/** Asking leads stand behind their chair, facing the camera, and wave. */
export const STAND_BACK = 0.62;
const FACE_CAMERA = Math.PI / 4;
const TURN_RATE = 12;

export type ActorPhase = "seated" | "arriving" | "leaving" | "free";

export interface Actor {
  spec: ActorSpec;
  puppet: Puppet;
  x: number;
  y: number;
  z: number;
  yaw: number;
  path: Point[];
  phase: ActorPhase;
  visible: boolean;
  bucket: VariantBucket | null;
  row: number;
  shadowRow: number;
}

export interface FrameContext {
  frustum: Frustum;
  grid: Grid | null;
  asking: ReadonlySet<string>;
  status: ReadonlyMap<string, AgentStatus>;
}

export interface FrameResult {
  /** Someone is walking: keep rendering every frame. */
  walking: boolean;
  /** A visible character plays a loop (typing, waving): render at the throttled tick rate. */
  ticking: boolean;
}

const sphere = new Sphere(new Vector3(), 1);
const shadowM = new Matrix4();

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function route(grid: Grid | null, from: Point, goal: Tile): Point[] | null {
  if (!grid) return null;
  const path = findPath(grid, tileOf(from.x, from.z), goal);
  return path ? path.slice(1).map(tileCenter) : null;
}

/**
 * Every character in the office (CEO, leads, members): spawning, walking, sitting and leaving, and
 * the per-frame copy of animated joints into the instanced renderers. Plain TS, owned by <Crowd>.
 */
export class CrowdSim {
  readonly actors = new Map<string, Actor>();
  private readonly buckets = new Map<string, VariantBucket>();
  private readonly shadows: BlobShadows;
  private allocDirty = true;
  private initialized = false;

  constructor(private readonly lib: CharacterLibrary, private readonly group: Group) {
    this.shadows = new BlobShadows(group);
  }

  private bucketFor(variant: string): VariantBucket {
    let b = this.buckets.get(variant);
    if (!b) {
      b = new VariantBucket(this.lib, this.lib.variants.has(variant) ? variant : [...this.lib.variants.keys()][0]!, this.group);
      this.buckets.set(variant, b);
    }
    return b;
  }

  private create(spec: ActorSpec, grid: Grid | null): Actor {
    const puppet = new Puppet(this.lib, (hashString(spec.id) % 1000) / 1000);
    const actor: Actor = {
      spec, puppet, x: ceo.x, y: 0, z: ceo.z, yaw: 0, path: [], phase: "free", visible: true, bucket: null, row: -1, shadowRow: -1,
    };
    if (spec.role === "member") {
      const seat = seatOf(spec.slot, spec.seat);
      const start = tileCenter(ENTRANCE_TILE);
      const walk = this.initialized ? route(grid, start, seat.approach) : null;
      if (walk) {
        actor.x = start.x;
        actor.z = start.z;
        actor.path = [...walk, seat.chair];
        actor.phase = "arriving";
      } else {
        actor.phase = "seated";
      }
    } else if (spec.role === "lead") {
      actor.phase = "seated";
    }
    return actor;
  }

  private leave(actor: Actor, grid: Grid | null): void {
    const seat = seatOf(actor.spec.slot, actor.spec.seat);
    const from = actor.phase === "seated" ? tileCenter(seat.approach) : { x: actor.x, z: actor.z };
    const walk = route(grid, from, ENTRANCE_TILE);
    if (!walk) {
      this.remove(actor.spec.id);
      return;
    }
    actor.path = actor.phase === "seated" ? [from, ...walk] : walk;
    actor.phase = "leaving";
  }

  private remove(id: string): void {
    const actor = this.actors.get(id);
    if (!actor) return;
    actor.puppet.dispose();
    this.actors.delete(id);
    this.allocDirty = true;
  }

  /** Reconciles the actors with the desired set. Members walk in/out; everyone else pops. */
  sync(specs: readonly ActorSpec[], grid: Grid | null): void {
    const wanted = new Map(specs.map((s) => [s.id, s]));
    const liveTeams = new Set(specs.flatMap((s) => (s.teamId ? [s.teamId] : [])));
    for (const [id, actor] of this.actors) {
      if (wanted.has(id)) continue;
      if (actor.spec.role === "member" && actor.spec.teamId && liveTeams.has(actor.spec.teamId)) {
        if (actor.phase !== "leaving") this.leave(actor, grid);
      } else {
        this.remove(id);
      }
    }
    for (const spec of specs) {
      const actor = this.actors.get(spec.id);
      if (!actor) {
        this.actors.set(spec.id, this.create(spec, grid));
        this.allocDirty = true;
        continue;
      }
      if (actor.spec.variant !== spec.variant) this.allocDirty = true;
      actor.spec = spec;
      if (actor.phase === "leaving") {
        // Came back before reaching the door: walk to the seat again.
        const seat = seatOf(spec.slot, spec.seat);
        const walk = route(grid, actor, seat.approach);
        actor.path = walk ? [...walk, seat.chair] : [];
        actor.phase = walk ? "arriving" : "seated";
      }
    }
    if (specs.some((s) => s.role === "lead")) this.initialized = true;
  }

  private allocate(): void {
    const groups = new Map<string, Actor[]>();
    for (const a of this.actors.values()) {
      const list = groups.get(a.spec.variant) ?? [];
      list.push(a);
      groups.set(a.spec.variant, list);
    }
    for (const [variant, bucket] of this.buckets) if (!groups.has(variant)) bucket.resize(0);
    let shadowRow = 0;
    for (const [variant, list] of groups) {
      const bucket = this.bucketFor(variant);
      bucket.resize(list.length);
      list.forEach((a, i) => {
        a.bucket = bucket;
        a.row = i;
        a.shadowRow = shadowRow++;
      });
    }
    this.shadows.resize(shadowRow);
    this.allocDirty = false;
  }

  /** Advances walking, picks each character's clip, and uploads what changed. */
  update(dt: number, ctx: FrameContext): FrameResult {
    let rewriteAll = false;
    if (this.allocDirty) {
      this.allocate();
      rewriteAll = true;
    }
    let walking = false;
    let ticking = false;
    let shadowsDirty = rewriteAll;
    const finished: string[] = [];
    const touched = new Set<VariantBucket>();

    for (const a of this.actors.values()) {
      const px = a.x;
      const pz = a.z;
      const py = a.y;
      const pyaw = a.yaw;
      let clip: ClipName = "idle";
      const spec = a.spec;
      if (spec.role === "ceo") {
        a.x = ceo.x;
        a.z = ceo.z;
        a.y = 0;
        a.yaw = ceo.heading;
        clip = ceo.moving ? "walk" : "idle";
      } else if (spec.role === "lead") {
        const seat = seatOf(spec.slot, 0);
        if (spec.teamId && ctx.asking.has(spec.teamId)) {
          a.x = seat.chair.x - Math.sin(seat.yaw) * STAND_BACK;
          a.z = seat.chair.z - Math.cos(seat.yaw) * STAND_BACK;
          a.y = 0;
          a.yaw = FACE_CAMERA;
          clip = "wave";
        } else {
          a.x = seat.chair.x;
          a.z = seat.chair.z;
          a.y = SEAT_Y;
          a.yaw = seat.yaw;
          clip = spec.teamId && ctx.status.get(spec.teamId) === "working" ? "type" : "sitIdle";
        }
      } else if (a.phase === "arriving" || a.phase === "leaving") {
        const step = advanceAlongPath(a, a.path, MEMBER_SPEED * dt);
        a.x = step.x;
        a.z = step.z;
        a.path = step.path;
        a.y = 0;
        if (step.heading !== null) a.yaw += shortestAngle(a.yaw, step.heading) * Math.min(1, dt * TURN_RATE);
        clip = "walk";
        walking = true;
        if (a.path.length === 0) {
          if (a.phase === "leaving") finished.push(spec.id);
          else a.phase = "seated";
        }
      } else {
        const seat = seatOf(spec.slot, spec.seat);
        a.x = seat.chair.x;
        a.z = seat.chair.z;
        a.y = SEAT_Y;
        a.yaw = seat.yaw;
        clip = "type";
      }

      const moved = rewriteAll || px !== a.x || pz !== a.z || py !== a.y || pyaw !== a.yaw;
      sphere.center.set(a.x, 0.7, a.z);
      a.visible = ctx.frustum.intersectsSphere(sphere);
      const switched = a.puppet.play(clip);
      const animate = LOOPING.has(clip) && a.visible;
      if (animate) a.puppet.advance(dt);
      if (a.visible && (clip === "type" || clip === "wave")) ticking = true;
      if ((moved || switched || animate) && a.bucket) {
        a.puppet.write(a.bucket.data, a.row, a.x, a.y, a.z, a.yaw);
        touched.add(a.bucket);
      }
      if (moved && a.shadowRow >= 0) {
        const s = a.y > 0 ? 0.95 : 0.8;
        shadowM.makeScale(s, 1, s).setPosition(a.x, 0.012, a.z);
        this.shadows.mesh.setMatrixAt(a.shadowRow, shadowM);
        shadowsDirty = true;
      }
    }
    for (const b of touched) b.texture.needsUpdate = true;
    if (shadowsDirty) this.shadows.mesh.instanceMatrix.needsUpdate = true;
    for (const id of finished) this.remove(id);
    return { walking: walking || finished.length > 0, ticking };
  }

  dispose(): void {
    for (const a of this.actors.values()) a.puppet.dispose();
    this.actors.clear();
    for (const b of this.buckets.values()) b.dispose();
    this.buckets.clear();
    this.shadows.dispose();
  }
}
