import type { AgentStatus } from "@studio/shared";

/** Monitor glow per herdr status (plan 1.4). */
export const STATUS_COLOR: Record<AgentStatus, string> = {
  working: "#5ad67d",
  idle: "#f2c14e",
  blocked: "#ff5a5a",
  done: "#5aa9ff",
  unknown: "#9aa0a6",
};

/**
 * One warm palette for the whole office: light oak floor, cream plaster, sage wainscot, and muted
 * terracotta / sage / oat accents. Every rug and fabric comes from the same few hues so nothing
 * shouts over the characters.
 */
export const PALETTE = {
  background: "#efe3d0",
  floorPlank: "#cdb18e",
  floorGap: "#b09678",
  floorCeo: "#bf9a74",
  floorLounge: "#e6cca6",
  wall: "#f8efe1",
  wallPanel: "#b4c29f",
  wallTrim: "#a07b5a",
  wallCap: "#8c6b4d",
  windowFrame: "#fffaf2",
  skyTop: "#bfe0f2",
  skyBottom: "#fff4dc",
  glassFrame: "#8a6f58",
  glass: "#e3f0ef",
  door: "#b5835a",
  screenOff: "#3a3f44",
  screenMember: "#a8dcf5",
  /** Pod rugs: oat, sage, terracotta, sand, dusty clay, grey-sage (muted, same value range). */
  podRugs: ["#e6d6bb", "#c8d1b6", "#dfc0aa", "#e9dbb6", "#d9c6b8", "#cbd2c4"],
  whiteboard: "#fbfaf6",
  meetingTable: "#c99a6b",
  counterTop: "#f1e8da",
  planter: "#b8936c",
  soil: "#6b5443",
} as const;

/**
 * Kenney furniture material name → colour, re-tuned to the palette above. Unlisted materials keep
 * the kit colour. Named tint sets override per placement.
 */
export const KIT_COLORS: Record<string, string> = {
  wood: "#f0dcba",
  woodDark: "#c9a07a",
  metal: "#eceae4",
  metalMedium: "#a5a39b",
  metalDark: "#4f5254",
  metalLight: "#f6f4ef",
  carpet: "#d4917a",
  carpetDarker: "#bf7b65",
  carpetBlue: "#9cae8d",
  carpetWhite: "#fbf7f0",
  plant: "#6e9f5c",
  lamp: "#ffe9bf",
};

export const KIT_TINTS: Record<string, Record<string, string>> = {
  /** Lead's office chair. */
  lead: { carpet: "#d98f66" },
  /** Member office chairs. */
  member: { carpet: "#a9b79a" },
  boss: { carpet: "#6b5546", metalMedium: "#5c544c" },
  ceoRug: { carpet: "#e4d2b4", carpetDarker: "#cdb38c" },
  loungeRug: { carpet: "#e8dcc4", carpetDarker: "#cdb593" },
  sageRug: { carpet: "#c9d1b6", carpetDarker: "#b3bd9c" },
  sage: { carpet: "#a9b79a", carpetBlue: "#a9b79a" },
  oat: { carpet: "#e8d8bb", carpetBlue: "#e8d8bb" },
  ...Object.fromEntries(PALETTE.podRugs.map((hex, i) => [`pod${i}`, { carpet: hex, carpetDarker: hex }])),
};

/** Materials that glow (unlit, no tone mapping) instead of being lit. */
export const KIT_GLOW = new Set(["lamp"]);
/** Materials rendered with the transparent glass material. */
export const KIT_GLASS = new Set(["glass"]);

/** Character variants (root node names in characters.glb). */
export const CEO_VARIANT = "male-d";
export const LEAD_VARIANTS = ["female-d", "male-a", "female-f"] as const;
export const MEMBER_VARIANTS = ["female-b", "male-f", "female-c", "male-b", "male-e"] as const;

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

/** Member variant + nameplate dot colour per agent type, so the same kind of agent looks the same. */
export function memberStyle(agentType: string): { variant: string; accent: string } {
  const seed = hashString(agentType.toLowerCase());
  return { variant: pick(MEMBER_VARIANTS, seed), accent: pick(ACCENTS, seed >>> 4) };
}

/** Muted dot colours, same value range as the palette accents. */
const ACCENTS = ["#c9765c", "#6f93b0", "#7ea36b", "#c99a4a", "#9a82ad", "#5f9e98"] as const;
