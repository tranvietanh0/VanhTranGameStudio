import { CanvasTexture, SRGBColorSpace } from "three";

let shadowTexture: CanvasTexture | null = null;

/** Soft radial blob (warm brown) used as the contact shadow under characters. Built once. */
export function getShadowTexture(): CanvasTexture {
  if (shadowTexture) return shadowTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[scene] 2D canvas unavailable for the shadow texture");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(60,38,20,0.42)");
  grad.addColorStop(0.55, "rgba(60,38,20,0.2)");
  grad.addColorStop(1, "rgba(60,38,20,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  shadowTexture = new CanvasTexture(canvas);
  shadowTexture.colorSpace = SRGBColorSpace;
  return shadowTexture;
}
