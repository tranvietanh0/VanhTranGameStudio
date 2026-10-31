import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, Float32BufferAttribute,
  IcosahedronGeometry, SphereGeometry, SRGBColorSpace,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Procedural low-poly building blocks. Every part carries a vertex colour so a whole piece of
 * furniture (or the entire static office) merges into ONE geometry = one draw call.
 */
export interface PartOpts {
  at?: [number, number, number];
  rot?: [number, number, number];
}

const tmpColor = new Color();

export function tint(geo: BufferGeometry, color: string, opts: PartOpts = {}): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const [rx, ry, rz] = opts.rot ?? [0, 0, 0];
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  const [x, y, z] = opts.at ?? [0, 0, 0];
  g.translate(x, y, z);
  tmpColor.set(color); // ColorManagement stores linear working-space values
  const count = g.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return g;
}

/** Axis-aligned box whose min-y sits at `y` (easier to stack furniture). */
export function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): BufferGeometry {
  return tint(new BoxGeometry(w, h, d), color, { at: [x, y + h / 2, z] });
}

export function cyl(rTop: number, rBottom: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 10): BufferGeometry {
  return tint(new CylinderGeometry(rTop, rBottom, h, seg), color, { at: [x, y + h / 2, z] });
}

export function ball(r: number, color: string, x = 0, y = 0, z = 0, detail = 0): BufferGeometry {
  return tint(new IcosahedronGeometry(r, detail), color, { at: [x, y, z] });
}

export function dome(r: number, color: string, x = 0, y = 0, z = 0): BufferGeometry {
  return tint(new SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), color, { at: [x, y, z] });
}

/** Merges tinted parts; throws instead of silently returning null on attribute mismatch. */
export function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error("[scene] mergeGeometries failed: parts have mismatched attributes");
  merged.computeBoundingSphere();
  return merged;
}

/** A potted plant centred on (x, z): pot + three foliage blobs. */
export function plantParts(x: number, z: number, scale = 1): BufferGeometry[] {
  const s = scale;
  return [
    cyl(0.2 * s, 0.15 * s, 0.32 * s, "#d98e6a", x, 0, z, 8),
    ball(0.26 * s, "#7cbf7a", x, 0.55 * s, z),
    ball(0.2 * s, "#8fd08a", x + 0.12 * s, 0.75 * s, z - 0.05 * s),
    ball(0.17 * s, "#6aae6e", x - 0.1 * s, 0.8 * s, z + 0.08 * s),
  ];
}

let shadowTexture: CanvasTexture | null = null;

/** One shared soft radial blob used by every fake contact shadow. */
export function getShadowTexture(): CanvasTexture {
  if (shadowTexture) return shadowTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[scene] 2D canvas unavailable for the shadow texture");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(70,45,25,0.38)");
  grad.addColorStop(0.6, "rgba(70,45,25,0.16)");
  grad.addColorStop(1, "rgba(70,45,25,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  shadowTexture = new CanvasTexture(canvas);
  shadowTexture.colorSpace = SRGBColorSpace;
  return shadowTexture;
}
