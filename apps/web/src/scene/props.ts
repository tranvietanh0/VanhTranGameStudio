import type { BufferGeometry } from "three";
import { ball, box, cyl, plantParts } from "./geometry";
import type { Prop } from "./layout";
import { PALETTE as P, pick } from "./palette";

/** World-space parts for one static prop, centred on its tile footprint. */
export function propParts(prop: Prop): BufferGeometry[] {
  const cx = prop.x + prop.w / 2;
  const cz = prop.z + prop.d / 2;
  const w = prop.w - 0.1;
  switch (prop.kind) {
    case "plant":
      return plantParts(cx, cz, 1.15);
    case "sofa":
      return [
        box(w, 0.36, 0.8, P.sofa, cx, 0.06, cz),
        box(w, 0.5, 0.22, "#d98f7f", cx, 0.3, cz - 0.3),
        box(0.2, 0.5, 0.8, "#d98f7f", cx - w / 2 + 0.1, 0.06, cz),
        box(0.2, 0.5, 0.8, "#d98f7f", cx + w / 2 - 0.1, 0.06, cz),
        box(0.5, 0.3, 0.12, "#f6e7a8", cx - 0.9, 0.42, cz - 0.15),
        box(0.5, 0.3, 0.12, "#a7c7e7", cx + 0.9, 0.42, cz - 0.15),
        ...[-1, 1].map((s) => box(0.08, 0.06, 0.6, "#8a6a52", cx + s * (w / 2 - 0.2), 0, cz)),
      ];
    case "coffeeTable":
      return [
        box(w, 0.06, 0.8, P.deskTop, cx, 0.36, cz),
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.06, 0.36, 0.06, P.deskLeg, cx + sx * (w / 2 - 0.1), 0, cz + sz * 0.32))),
        cyl(0.05, 0.05, 0.09, "#ffffff", cx - 0.3, 0.42, cz, 8),
        box(0.36, 0.04, 0.26, "#7fa8c9", cx + 0.3, 0.42, cz),
      ];
    case "bookshelf": {
      const parts = [box(w, 1.5, 0.4, P.bookshelf, cx, 0, cz)];
      for (let shelf = 0; shelf < 3; shelf++) {
        for (let i = 0; i < 6; i++) {
          const h = 0.26 + ((i * 7 + shelf * 3) % 4) * 0.03;
          parts.push(box(0.2, h, 0.06, pick(P.books, i + shelf), cx - w / 2 + 0.25 + i * 0.27, 0.12 + shelf * 0.46, cz + 0.2));
        }
      }
      return parts;
    }
    case "bossDesk":
      return [
        box(w, 0.08, 0.95, P.bossDesk, cx, 0.74, cz),
        box(w - 0.1, 0.74, 0.08, "#6f4e36", cx, 0, cz + 0.4),
        box(0.12, 0.74, 0.85, "#6f4e36", cx - w / 2 + 0.08, 0, cz),
        box(0.12, 0.74, 0.85, "#6f4e36", cx + w / 2 - 0.08, 0, cz),
        box(0.5, 0.02, 0.34, "#c9ccd2", cx, 0.82, cz - 0.05),
        box(0.5, 0.32, 0.02, "#8f949c", cx, 0.83, cz + 0.12),
        box(0.4, 0.1, 0.06, "#f2c14e", cx + 0.9, 0.82, cz + 0.3),
        cyl(0.08, 0.1, 0.04, "#3b2f26", cx - 1.1, 0.82, cz - 0.2, 8),
        cyl(0.015, 0.015, 0.35, "#3b2f26", cx - 1.1, 0.86, cz - 0.2, 4),
        ball(0.1, "#fff1b8", cx - 1.1, 1.24, cz - 0.2, 1),
      ];
    case "bossChair":
      return [
        cyl(0.3, 0.3, 0.04, P.chairBase, cx, 0.02, cz, 10),
        cyl(0.04, 0.04, 0.38, P.chairBase, cx, 0.06, cz, 6),
        box(0.62, 0.12, 0.58, P.bossChair, cx, 0.44, cz),
        box(0.62, 0.8, 0.12, P.bossChair, cx, 0.56, cz - 0.28),
      ];
    case "cooler":
      return [
        box(0.5, 0.95, 0.5, P.cooler, cx, 0, cz),
        cyl(0.18, 0.18, 0.5, "#a7d8f0", cx, 0.95, cz, 10),
        box(0.12, 0.08, 0.04, "#7fa8c9", cx, 0.7, cz + 0.26),
      ];
  }
}

