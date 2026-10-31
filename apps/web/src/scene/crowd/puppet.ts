import { AnimationMixer, Group, LoopRepeat, type AnimationAction, type Object3D } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CHAR_SCALE, JOINTS, ROW_TEXELS, type CharacterLibrary, type ClipName } from "./rig";

/** Clips that keep moving while shown; the others are a single frozen pose (no frames needed). */
export const LOOPING: ReadonlySet<ClipName> = new Set(["walk", "type", "wave"]);

/**
 * One character's animation state: a cloned bone tree driven by its own AnimationMixer. Never added
 * to the rendered scene; its joint world matrices are copied into the variant's joint texture.
 */
export class Puppet {
  readonly root = new Group();
  private readonly mixer: AnimationMixer;
  private readonly joints: Object3D[];
  private readonly actions = new Map<ClipName, AnimationAction>();
  private current: ClipName | null = null;

  /** `phase` (0..1) desynchronises identical loops so a room of typists does not move in lockstep. */
  constructor(private readonly lib: CharacterLibrary, private readonly phase: number) {
    const rig = cloneSkeleton(lib.rigTemplate);
    this.root.add(rig);
    this.root.scale.setScalar(CHAR_SCALE);
    this.joints = JOINTS.map((j) => {
      let found: Object3D | undefined;
      rig.traverse((o) => {
        if (!found && o.name.replace(/_\d+$/, "") === j) found = o;
      });
      if (!found) throw new Error(`[puppet] joint ${j} missing in rig clone`);
      return found;
    });
    this.mixer = new AnimationMixer(this.root);
  }

  get clip(): ClipName | null {
    return this.current;
  }

  /** Switches clip (no-op when unchanged) and evaluates the first pose. */
  play(name: ClipName): boolean {
    if (this.current === name) return false;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    prev?.stop();
    let action = this.actions.get(name);
    if (!action) {
      action = this.mixer.clipAction(this.lib.clips[name]);
      action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
      this.actions.set(name, action);
    }
    action.reset();
    action.time = LOOPING.has(name) ? this.phase * action.getClip().duration : 0;
    action.play();
    this.current = name;
    this.mixer.update(0);
    return true;
  }

  advance(dt: number): void {
    this.mixer.update(dt);
  }

  /** Places the character and writes its joint world matrices into `data` at instance `row`. */
  write(data: Float32Array, row: number, x: number, y: number, z: number, yaw: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, yaw, 0);
    this.root.updateMatrixWorld(true);
    const offset = row * ROW_TEXELS * 4;
    this.joints.forEach((j, i) => data.set(j.matrixWorld.elements, offset + i * 16));
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}
