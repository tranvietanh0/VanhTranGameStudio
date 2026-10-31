import { DoubleSide, InstancedBufferAttribute, MeshBasicMaterial, MeshStandardMaterial, type InstancedMesh } from "three";
import { PALETTE } from "./palette";

/** Instance buffer capacity: powers of two ≥ 16, so adding a team rarely recreates the mesh. */
export function capacityFor(count: number): number {
  let cap = 16;
  while (cap < count) cap *= 2;
  return cap;
}

/**
 * Makes sure instanceColor exists before the first render; a material compiled without it would
 * otherwise ignore per-instance colours until recompiled.
 */
export function ensureInstanceColor(mesh: InstancedMesh, capacity: number): void {
  if (mesh.instanceColor && mesh.instanceColor.count >= capacity) return;
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
}

/** Flags matrices for upload and refreshes the bounds used for culling and raycasting. */
export function commitMatrices(mesh: InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
}

export function commitColors(mesh: InstancedMesh): void {
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** Shared materials (module singletons: one program per feature set, reused by every mesh). */
export const MATERIALS = {
  /** Lit, vertex-coloured, shadowed: the whole merged static office. */
  solid: new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }),
  /** Unlit and not tone-mapped: window daylight, lamp shades. */
  glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  /** Unlit: monitor screens read as glowing without bloom. */
  screen: new MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
  glass: new MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0, depthWrite: false, side: DoubleSide,
  }),
  /** Invisible but raycastable hit volumes (no draw call). */
  hit: new MeshBasicMaterial({ visible: false }),
};

export const BACKGROUND = PALETTE.background;
