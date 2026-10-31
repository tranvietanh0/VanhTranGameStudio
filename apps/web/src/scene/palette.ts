import type { AgentStatus } from "@studio/shared";

/** Monitor glow per herdr status (plan 1.4). */
export const STATUS_COLOR: Record<AgentStatus, string> = {
  working: "#5ad67d",
  idle: "#f2c14e",
  blocked: "#ff5a5a",
  done: "#5aa9ff",
  unknown: "#9aa0a6",
};

/** Warm pastel diorama palette. */
export const PALETTE = {
  background: "#f3e6d3",
  floor: "#e9d2b0",
  floorCeo: "#d9c7e6",
  wall: "#f7ede0",
  wallTrim: "#c9a882",
  glass: "#bfe3f2",
  glassFrame: "#8fa7b3",
  rugLounge: "#f2b5a7",
  rugCeo: "#a7c7e7",
  deskTop: "#e8c8a0",
  deskLeg: "#9c7a5b",
  chair: "#7fa8c9",
  chairBase: "#5b5f66",
  monitor: "#3d3f45",
  pot: "#d98e6a",
  leaf: "#7cbf7a",
  sofa: "#e7a08f",
  bookshelf: "#b48a67",
  books: ["#f2c14e", "#7fa8c9", "#e7a08f", "#8cc6a1"],
  bossDesk: "#8b6446",
  bossChair: "#3f3a4a",
  cooler: "#dfe9f2",
  skin: ["#f6d3b8", "#eebc98", "#d9a07a", "#b97f5a"],
  hair: ["#3b2f26", "#5a3e2b", "#2b2b33", "#8a5a3b", "#c9a35a"],
  shirts: ["#f4a6a6", "#a6c8f4", "#b8e0b0", "#f4d8a6", "#d0b8f0", "#a6e4e0", "#f4c2e0", "#c8d6a0"],
  ceoSuit: "#2f3b5c",
  ceoShirt: "#fdfbf7",
  ceoTie: "#d8434a",
  ceoSkin: "#f1c9a5",
  ceoHair: "#2a2320",
} as const;

/** Small stable string hash (FNV-1a) used to pick per-team colours. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pick<T>(list: readonly T[], seed: number): T {
  return list[seed % list.length] as T;
}
