import {
  AnimationClip, BufferGeometry, DataTexture, Float32BufferAttribute, FloatType, Group, Matrix3, Matrix4,
  MeshStandardMaterial, NearestFilter, Quaternion, QuaternionKeyframeTrack, RGBAFormat, Vector3, VectorKeyframeTrack,
  type KeyframeTrack, type Object3D, type SkinnedMesh, type Texture,
} from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

/** Packed CC0 Kenney Mini Characters (see public/assets/CREDITS.md). */
export const CHARACTERS_URL = "/assets/characters.glb";
/** Character model units → office tiles. */
export const CHAR_SCALE = 1.15;

/**
 * The Kenney mini-character rig. Every vertex is skinned rigidly to exactly one of these joints,
 * which is what lets all characters of a variant render as ONE instanced draw call.
 */
export const JOINTS = ["root", "leg-left", "leg-right", "torso", "arm-left", "arm-right", "head"] as const;
export const JOINT_COUNT = JOINTS.length;
/** Texels per instance row in the joint texture (4 columns per mat4). */
export const ROW_TEXELS = JOINT_COUNT * 4;

export type ClipName = "idle" | "walk" | "type" | "sitIdle" | "wave";

export interface CharacterLibrary {
  /** Variant name → geometry baked into joint-local space (attributes position, normal, uv, joint). */
  variants: Map<string, BufferGeometry>;
  map: Texture;
  clips: Record<ClipName, AnimationClip>;
  /** Template of the animated skeleton (the first variant's bone tree with its parent transform). */
  rigTemplate: Object3D;
}

const base = (name: string) => name.replace(/_\d+$/, "");

function jointIndex(boneName: string): number {
  const i = (JOINTS as readonly string[]).indexOf(base(boneName));
  if (i < 0) throw new Error(`[rig] unexpected bone "${boneName}"`);
  return i;
}

/** Bakes the skinned meshes of one variant into a single joint-local geometry. */
function bakeVariant(variant: Object3D): BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uvs: number[] = [];
  const joint: number[] = [];
  const v = new Vector3();
  const n = new Vector3();
  const m = new Matrix4();
  const nm = new Matrix3();
  variant.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const g = mesh.geometry;
    const pa = g.getAttribute("position");
    const na = g.getAttribute("normal");
    const ua = g.getAttribute("uv");
    const si = g.getAttribute("skinIndex");
    const sw = g.getAttribute("skinWeight");
    if (!pa || !na || !ua || !si || !sw) throw new Error(`[rig] ${variant.name}: skinned mesh lacks attributes`);
    const perBone = mesh.skeleton.bones.map((bone, b) => {
      const mat = new Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[b] ?? new Matrix4(), mesh.bindMatrix);
      return { mat, normal: new Matrix3().getNormalMatrix(mat), joint: jointIndex(bone.name) };
    });
    const count = g.index ? g.index.count : pa.count;
    for (let k = 0; k < count; k++) {
      const i = g.index ? g.index.getX(k) : k;
      let best = 0;
      for (let c = 1; c < 4; c++) if (sw.getComponent(i, c) > sw.getComponent(i, best)) best = c;
      const bone = perBone[si.getComponent(i, best)];
      if (!bone) throw new Error(`[rig] ${variant.name}: bad skin index`);
      m.copy(bone.mat);
      nm.copy(bone.normal);
      v.fromBufferAttribute(pa, i).applyMatrix4(m);
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      pos.push(v.x, v.y, v.z);
      nrm.push(n.x, n.y, n.z);
      uvs.push(ua.getX(i), ua.getY(i));
      joint.push(bone.joint);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  g.setAttribute("joint", new Float32BufferAttribute(joint, 1));
  g.computeBoundingSphere();
  return g;
}

const DEG = Math.PI / 180;
const qa = new Quaternion();
const qb = new Quaternion();
const AX = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

/** Rotation about y then z (the arms are modelled pointing sideways, T-pose). */
function yz(yawDeg: number, rollDeg: number): number[] {
  qa.setFromAxisAngle(AX.y, yawDeg * DEG);
  qb.setFromAxisAngle(AX.z, rollDeg * DEG);
  return qa.multiply(qb).toArray() as number[];
}

function rx(deg: number): number[] {
  return qa.setFromAxisAngle(AX.x, deg * DEG).toArray() as number[];
}

interface Pose {
  root: [number, number, number];
  legL: number[];
  legR: number[];
  torso: number[];
  armL: number[];
  armR: number[];
  head: number[];
}

/** Builds a clip sampling `poseAt(t)` at `steps` keys over `duration` seconds (looping). */
function proceduralClip(name: string, names: Record<(typeof JOINTS)[number], string>, duration: number, steps: number, poseAt: (phase: number) => Pose): AnimationClip {
  const times: number[] = [];
  const keys: Pose[] = [];
  for (let s = 0; s <= steps; s++) {
    times.push((duration * s) / steps);
    keys.push(poseAt((s % steps) / steps));
  }
  const q = (bone: string, pick: (p: Pose) => number[]): KeyframeTrack =>
    new QuaternionKeyframeTrack(`${bone}.quaternion`, times, keys.flatMap(pick));
  return new AnimationClip(name, duration, [
    new VectorKeyframeTrack(`${names.root}.position`, times, keys.flatMap((p) => p.root)),
    q(names["leg-left"], (p) => p.legL),
    q(names["leg-right"], (p) => p.legR),
    q(names.torso, (p) => p.torso),
    q(names["arm-left"], (p) => p.armL),
    q(names["arm-right"], (p) => p.armR),
    q(names.head, (p) => p.head),
  ]);
}

/** Sitting lowers the root by this much (from the kit's own "sit" clip) and bends the hips. */
const SIT_DROP = -0.15;
const SIT_LEG = [0.609, 0, 0, 0.793];
const ID = [0, 0, 0, 1];

function buildClips(names: Record<(typeof JOINTS)[number], string>, fileClips: AnimationClip[]): Record<ClipName, AnimationClip> {
  const byName = new Map(fileClips.map((c) => [c.name, c]));
  const walk = byName.get("walk");
  const idle = byName.get("idle");
  if (!walk || !idle) throw new Error("[rig] characters.glb lacks the walk/idle clips");
  const TAU = Math.PI * 2;
  const type = proceduralClip("type", names, 0.5, 8, (t) => {
    const s = Math.sin(t * TAU * 2);
    return {
      root: [0, SIT_DROP, 0], legL: SIT_LEG, legR: SIT_LEG, torso: rx(6),
      armL: yz(-62, -(14 + 7 * s)), armR: yz(62, 14 - 7 * s), head: rx(5 + 2 * Math.sin(t * TAU)),
    };
  });
  const sitIdle = proceduralClip("sitIdle", names, 1, 1, () => ({
    root: [0, SIT_DROP, 0], legL: SIT_LEG, legR: SIT_LEG, torso: rx(-3), armL: yz(-50, -28), armR: yz(50, 28), head: rx(-4),
  }));
  const wave = proceduralClip("wave", names, 0.7, 8, (t) => {
    const s = Math.sin(t * TAU);
    return {
      root: [0, 0, 0], legL: ID, legR: ID, torso: qa.setFromAxisAngle(AX.z, 3 * s * DEG).toArray() as number[],
      armL: yz(0, -45), armR: yz(10, -(95 + 22 * s)), head: qa.setFromAxisAngle(AX.z, -5 * s * DEG).toArray() as number[],
    };
  });
  return { idle, walk, type, sitIdle, wave };
}

/** Builds the character library from the loaded characters.glb scene and its clips. */
export function buildLibrary(scene: Object3D, animations: AnimationClip[]): CharacterLibrary {
  scene.updateMatrixWorld(true);
  const variants = new Map<string, BufferGeometry>();
  let map: Texture | null = null;
  let rigTemplate: Object3D | null = null;
  let names: Record<(typeof JOINTS)[number], string> | null = null;
  for (const variant of scene.children) {
    variants.set(base(variant.name), bakeVariant(variant));
    variant.traverse((o) => {
      const mesh = o as SkinnedMesh;
      if (!map && mesh.isSkinnedMesh) map = (mesh.material as MeshStandardMaterial).map;
    });
    if (rigTemplate) continue;
    const root = variant.getObjectByName("root");
    if (!root || !root.parent) throw new Error("[rig] first character has no root bone");
    // Bone tree plus the transform of its parent, so the rest pose lands exactly where it was bound.
    const holder = new Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(root.parent.matrixWorld);
    holder.add(cloneSkeleton(root));
    rigTemplate = holder;
    names = Object.fromEntries(JOINTS.map((j) => {
      let found = "";
      root.traverse((o) => {
        if (!found && base(o.name) === j) found = o.name;
      });
      if (!found) throw new Error(`[rig] joint ${j} missing`);
      return [j, found];
    })) as Record<(typeof JOINTS)[number], string>;
  }
  if (!map || !rigTemplate || !names) throw new Error("[rig] characters.glb has no skinned characters");
  return { variants, map, clips: buildClips(names, animations), rigTemplate };
}

/** Joint matrices of up to `capacity` instances, one texture row per instance. */
export function createJointTexture(capacity: number): DataTexture {
  const tex = new DataTexture(new Float32Array(capacity * ROW_TEXELS * 4), ROW_TEXELS, capacity, RGBAFormat, FloatType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Lit, textured material that skins each vertex by the joint matrix of its instance, fetched from
 * the joint texture. The matrices are already in world space, so instanceMatrix stays identity.
 * `jointTex` is a shared uniform object, so a grown texture can be swapped in without recompiling.
 */
export function createCharacterMaterial(map: Texture, jointTex: { value: DataTexture }): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ map, roughness: 0.78, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.jointTex = jointTex;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform highp sampler2D jointTex;
attribute float joint;
mat4 crowdJointMatrix() {
  int c = int(joint + 0.5) * 4;
  int r = gl_InstanceID;
  return mat4(texelFetch(jointTex, ivec2(c, r), 0), texelFetch(jointTex, ivec2(c + 1, r), 0),
              texelFetch(jointTex, ivec2(c + 2, r), 0), texelFetch(jointTex, ivec2(c + 3, r), 0));
}`,
      )
      .replace("#include <beginnormal_vertex>", "mat4 crowdJm = crowdJointMatrix();\nvec3 objectNormal = normalize(mat3(crowdJm) * normal);")
      .replace("#include <begin_vertex>", "vec3 transformed = (crowdJm * vec4(position, 1.0)).xyz;");
  };
  mat.customProgramCacheKey = () => "crowd-joint-skin";
  return mat;
}
