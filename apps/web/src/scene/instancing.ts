import {
  Color, DoubleSide, InstancedBufferAttribute, MeshBasicMaterial, MeshLambertMaterial, type InstancedMesh,
} from "three";
import { getShadowTexture } from "./geometry";
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
  /** Lit, vertex-coloured: static office and merged furniture. */
  vertex: new MeshLambertMaterial({ vertexColors: true }),
  /** Lit, white base so instanceColor carries the colour (characters). */
  plain: new MeshLambertMaterial({ color: "#ffffff" }),
  /** Unlit: the monitor screens read as glowing without bloom. */
  screen: new MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
  glass: new MeshLambertMaterial({
    vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide,
  }),
  shadow: new MeshBasicMaterial({
    map: getShadowTexture(), transparent: true, depthWrite: false, color: new Color("#ffffff"),
  }),
};

export const BACKGROUND = PALETTE.background;
