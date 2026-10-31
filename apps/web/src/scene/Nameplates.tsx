import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { Vector3, type Group } from "three";
import type { AskingInfo } from "./asking";
import { useOfficeStore } from "../store/officeStore";
import { SceneHtml } from "./SceneHtml";
import { readZoom } from "./CameraRig";
import { crowdRuntime } from "./crowd/Crowd";
import { ceo, focus, hover } from "./runtime";

/** Zoom (px per tile) from which nameplates also show around the camera focus, with the task line. */
const DETAIL_ZOOM = 88;
/** Zoomed in: only members this close to the camera focus get a plate. */
const DETAIL_RADIUS = 4;
/** Fixed pool: plates are re-pointed, never unmounted, so React never tears down an Html root mid-frame. */
const POOL = 8;
/**
 * Plate anchor = bottom centre of the card, a hand's width above the head. Seated head top is
 * ~0.96 (SEAT_Y + rig drop + 0.83 tall chibi), standing ~0.83.
 */
const SEATED_Y = 1.04;
const STANDING_Y = 0.94;
/** Estimated card metrics (px) for the overlap test: 12px text, ~6.7px per character. */
const CHAR_PX = 6.7;
const PLATE_PAD_PX = 26;
const PLATE_MAX_PX = 160;
const LINE_PX = 16;
const GAP_PX = 3;

const tmp = new Vector3();

type Rect = [number, number, number, number];

function overlaps(r: Rect, list: readonly Rect[]): boolean {
  return list.some((o) => r[0] < o[2] + GAP_PX && o[0] < r[2] + GAP_PX && r[1] < o[3] + GAP_PX && o[1] < r[3] + GAP_PX);
}

interface Plate {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
}

interface View {
  plates: Plate[];
  detail: boolean;
}

/**
 * Nameplates (agent type, and the task when zoomed in) over subagent characters. The set is picked
 * on rendered frames and committed to React only when it changes; anchors follow walking members
 * by moving their groups each frame, so React stays idle while they walk.
 */
export function Nameplates({ asking }: { asking: Map<string, AskingInfo> }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const selectedTeamId = useOfficeStore((s) => s.selectedTeamId);
  const [view, setView] = useState<View>({ plates: [], detail: false });
  const lastKey = useRef("");
  const anchors = useRef<Array<Group | null>>([]);

  useFrame(() => {
    const sim = crowdRuntime.sim;
    if (!sim) return;
    const zoom = readZoom(camera);
    const detail = zoom >= DETAIL_ZOOM;
    const fx = focus.mode === "ceo" ? ceo.x : focus.x;
    const fz = focus.mode === "ceo" ? ceo.z : focus.z;
    const scored: Array<{ id: string; score: number }> = [];
    for (const a of sim.actors.values()) {
      const team = a.spec.teamId;
      // An asking lead's bubble owns its pod: no plates there, so the two never overlap.
      if (a.spec.role !== "member" || !a.visible || (team && asking.has(team))) continue;
      const dist = Math.hypot(fx - a.x, fz - a.z);
      if (team === selectedTeamId || team === hover.teamId) scored.push({ id: a.spec.id, score: dist - 1000 });
      else if (detail && dist <= DETAIL_RADIUS) scored.push({ id: a.spec.id, score: dist });
    }
    scored.sort((p, q) => p.score - q.score);
    // Greedy screen-space packing: a plate that would overlap a higher-priority one is skipped,
    // so plates never stack on each other inside a cluster.
    const placed: Rect[] = [];
    const ids: string[] = [];
    for (const s of scored) {
      if (ids.length >= POOL) break;
      const a = sim.actors.get(s.id);
      if (!a) continue;
      const y = a.y > 0 ? SEATED_Y : STANDING_Y;
      tmp.set(a.x, y, a.z).project(camera);
      const sx = ((tmp.x + 1) / 2) * size.width;
      const sy = ((1 - tmp.y) / 2) * size.height;
      const sub = detail && a.spec.subtitle ? a.spec.subtitle.length : 0;
      const w = Math.min(PLATE_MAX_PX, Math.max(a.spec.title.length + 2, sub) * CHAR_PX + PLATE_PAD_PX);
      const h = (sub ? 2 : 1) * LINE_PX + 5;
      const rect: Rect = [sx - w / 2, sy - h, sx + w / 2, sy];
      if (overlaps(rect, placed)) continue;
      placed.push(rect);
      const g = anchors.current[ids.length];
      if (g) g.position.set(a.x, y, a.z);
      ids.push(s.id);
    }
    const key = `${detail}|${ids.join(",")}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    setView({
      detail,
      plates: ids.flatMap((id) => {
        const s = sim.actors.get(id)?.spec;
        return s ? [{ id, title: s.title, subtitle: s.subtitle, accent: s.accent }] : [];
      }),
    });
  });

  useEffect(() => invalidate(), [view, invalidate]);

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => {
        const plate = view.plates[i];
        return (
          <group key={i} ref={(g) => void (anchors.current[i] = g)}>
            <SceneHtml pointerEvents="none">
              <div className="scene-plate" hidden={!plate}>
                <b>
                  <i style={plate ? { background: plate.accent } : undefined} />
                  {plate?.title}
                </b>
                {view.detail && plate?.subtitle && <span>{plate.subtitle}</span>}
              </div>
            </SceneHtml>
          </group>
        );
      })}
    </>
  );
}
