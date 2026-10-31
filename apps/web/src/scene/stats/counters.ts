import type { WebGLRenderer } from "three";

/**
 * Dev-only counters written by the in-canvas probe and read by the DOM overlay on its own timer,
 * so the overlay never causes a WebGL frame.
 */
export const statsProbe = {
  /** Frames actually rendered since load: must stop increasing while the office is idle. */
  frames: 0,
  renderer: null as WebGLRenderer | null,
};
