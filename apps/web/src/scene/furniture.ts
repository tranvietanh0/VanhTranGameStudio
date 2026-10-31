import { CapsuleGeometry, PlaneGeometry, SphereGeometry } from "three";
import { ball, box, cyl, merge, tint } from "./geometry";
import { PALETTE as P } from "./palette";

/**
 * Per-instance furniture and character geometry, built once and shared by every InstancedMesh.
 * Local origin = floor point under the piece; the lead faces -z (towards the monitor).
 */
function once<T>(build: () => T): () => T {
  let value: T | null = null;
  return () => {
    if (value === null) value = build();
    return value;
  };
}

/** Desk: rounded-ish top, four legs, keyboard, mug. Footprint 2 x 0.95 centred on origin. */
export const deskGeometry = once(() =>
  merge([
    box(2, 0.07, 0.95, P.deskTop, 0, 0.72, 0),
    box(1.94, 0.04, 0.89, "#f1d9b8", 0, 0.7, 0),
    ...[-0.92, 0.92].flatMap((x) => [-0.4, 0.4].map((z) => box(0.06, 0.7, 0.06, P.deskLeg, x, 0, z))),
    box(0.5, 0.025, 0.16, "#f7f3ee", 0, 0.79, 0.24),
    cyl(0.05, 0.05, 0.1, "#ffffff", 0.7, 0.79, 0.15, 8),
    box(0.3, 0.02, 0.22, "#fff8ec", -0.6, 0.79, 0.12),
  ]),
);

/** Office chair centred on origin; the backrest sits on +z (behind the seated lead). */
export const chairGeometry = once(() =>
  merge([
    cyl(0.26, 0.26, 0.04, P.chairBase, 0, 0.02, 0, 10),
    cyl(0.035, 0.035, 0.36, P.chairBase, 0, 0.06, 0, 6),
    box(0.5, 0.09, 0.48, P.chair, 0, 0.42, 0),
    box(0.48, 0.5, 0.08, P.chair, 0, 0.55, 0.22),
  ]),
);

/** Monitor frame + stand. The glowing screen is a separate instanced plane (status colour). */
export const monitorGeometry = once(() =>
  merge([
    box(0.32, 0.02, 0.2, P.monitor, 0, 0.79, 0),
    box(0.07, 0.24, 0.05, P.monitor, 0, 0.8, 0),
    box(0.92, 0.54, 0.05, P.monitor, 0, 0.98, 0),
  ]),
);

export const SCREEN_Y = 1.25;
export const screenGeometry = once(() => {
  const g = new PlaneGeometry(0.84, 0.46);
  g.translate(0, SCREEN_Y, 0.027);
  return g;
});

/** Character parts in body-local space (origin = hips at y 0). */
export const leadBodyGeometry = once(() => tint(new CapsuleGeometry(0.18, 0.3, 3, 8), "#ffffff", { at: [0, 0.3, 0] }));
export const leadHeadGeometry = once(() => tint(new SphereGeometry(0.17, 10, 8), "#ffffff"));
export const leadHairGeometry = once(() =>
  tint(new SphereGeometry(0.18, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.1), "#ffffff", { at: [0, 0.02, 0.01] }),
);
/** Arm hangs from its pivot (shoulder) at the origin, pointing down -y. */
export const ARM_LENGTH = 0.36;
export const leadArmGeometry = once(() =>
  tint(new CapsuleGeometry(0.055, ARM_LENGTH - 0.11, 2, 6), "#ffffff", { at: [0, -ARM_LENGTH / 2, 0] }),
);

/** The CEO avatar as one merged mesh: suit, white shirt, red tie, head, hair, legs. Faces +z. */
export const ceoGeometry = once(() =>
  merge([
    box(0.13, 0.45, 0.16, P.ceoSuit, -0.1, 0, 0),
    box(0.13, 0.45, 0.16, P.ceoSuit, 0.1, 0, 0),
    box(0.15, 0.06, 0.22, "#2a2320", -0.1, 0, 0.03),
    box(0.15, 0.06, 0.22, "#2a2320", 0.1, 0, 0.03),
    tint(new CapsuleGeometry(0.21, 0.32, 3, 10), P.ceoSuit, { at: [0, 0.78, 0] }),
    box(0.16, 0.36, 0.05, P.ceoShirt, 0, 0.66, 0.18),
    box(0.06, 0.28, 0.03, P.ceoTie, 0, 0.66, 0.205),
    box(0.08, 0.06, 0.03, P.ceoTie, 0, 0.94, 0.205),
    tint(new CapsuleGeometry(0.06, 0.34, 2, 6), P.ceoSuit, { at: [-0.27, 0.72, 0], rot: [0, 0, 0.12] }),
    tint(new CapsuleGeometry(0.06, 0.34, 2, 6), P.ceoSuit, { at: [0.27, 0.72, 0], rot: [0, 0, -0.12] }),
    ball(0.06, P.ceoSkin, -0.3, 0.5, 0, 1),
    ball(0.06, P.ceoSkin, 0.3, 0.5, 0, 1),
    tint(new SphereGeometry(0.19, 12, 10), P.ceoSkin, { at: [0, 1.2, 0] }),
    tint(new SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), P.ceoHair, { at: [0, 1.23, -0.01] }),
    box(0.03, 0.03, 0.02, "#2a2320", -0.07, 1.21, 0.18),
    box(0.03, 0.03, 0.02, "#2a2320", 0.07, 1.21, 0.18),
  ]),
);

