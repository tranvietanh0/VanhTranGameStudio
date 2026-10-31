import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Team } from "@studio/shared";
import { useOfficeStore } from "../store/officeStore";
import { OVERLAY_Z } from "./Bubbles";
import { readZoom } from "./CameraRig";
import { approachTile, deskCenter, tileCenter } from "./layout";
import { STATUS_COLOR } from "./palette";
import { ceo, focus } from "./runtime";

/** CEO within this many tiles of a desk's approach tile → "Làm việc với team" button. */
export const WORK_RADIUS = 1.5;
const NEAR_LABEL_RADIUS = 3.5;
/** Zoom (px per tile) from which labels also appear around the camera focus. */
const LABEL_ZOOM = 55;
/** Hard cap on label DOM nodes. */
const MAX_LABELS = 12;

interface View {
  labels: string[];
  near: string | null;
}

interface Props {
  teams: Team[];
}

/**
 * Desk name signs and the work button, computed on rendered frames only and committed to React
 * only when the visible set changes, so DOM nodes stay few and React stays idle while walking.
 */
export function DeskOverlays({ teams }: Props) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const selectedTeamId = useOfficeStore((s) => s.selectedTeamId);
  const [view, setView] = useState<View>({ labels: [], near: null });
  const lastKey = useRef("");

  useFrame(() => {
    const zoom = readZoom(camera);
    const fx = focus.mode === "ceo" ? ceo.x : focus.x;
    const fz = focus.mode === "ceo" ? ceo.z : focus.z;
    let near: string | null = null;
    let nearDist = Number.POSITIVE_INFINITY;
    const scored: Array<{ id: string; score: number }> = [];
    for (const team of teams) {
      const a = tileCenter(approachTile(team.slot));
      const toApproach = Math.hypot(ceo.x - a.x, ceo.z - a.z);
      if (toApproach <= WORK_RADIUS && toApproach < nearDist) {
        near = team.id;
        nearDist = toApproach;
      }
      const d = deskCenter(team.slot);
      if (team.id === selectedTeamId || Math.hypot(ceo.x - d.x, ceo.z - d.z) <= NEAR_LABEL_RADIUS) {
        scored.push({ id: team.id, score: -1 });
      } else if (zoom >= LABEL_ZOOM) {
        scored.push({ id: team.id, score: Math.hypot(fx - d.x, fz - d.z) });
      }
    }
    scored.sort((x, y) => x.score - y.score);
    const labels = scored.slice(0, MAX_LABELS).map((s) => s.id);
    const key = `${labels.join(",")}|${near ?? ""}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    setView({ labels, near });
  });

  // Freshly mounted Html nodes are positioned on the next frame.
  useEffect(() => invalidate(), [view, invalidate]);

  const byId = new Map(teams.map((t) => [t.id, t]));
  const nearTeam = view.near ? byId.get(view.near) : undefined;

  return (
    <>
      {view.labels.map((id) => {
        const team = byId.get(id);
        if (!team) return null;
        const d = deskCenter(team.slot);
        return (
          <Html key={id} position={[d.x, 1.75, d.z - 0.3]} center zIndexRange={OVERLAY_Z} pointerEvents="none">
            <div className="scene-sign" data-selected={team.id === selectedTeamId}>
              <i style={{ background: STATUS_COLOR[team.status] }} />
              {team.projectName}
            </div>
          </Html>
        );
      })}
      {nearTeam && <WorkButton team={nearTeam} />}
    </>
  );
}

function WorkButton({ team }: { team: Team }) {
  const a = tileCenter(approachTile(team.slot));
  const open = () => {
    const s = useOfficeStore.getState();
    s.selectTeam(team.id);
    s.openTerminal(team.id);
  };
  return (
    <Html position={[a.x, 0, a.z + 0.7]} center zIndexRange={OVERLAY_Z}>
      <button type="button" className="scene-work" onClick={open}>
        Làm việc với team
      </button>
    </Html>
  );
}
