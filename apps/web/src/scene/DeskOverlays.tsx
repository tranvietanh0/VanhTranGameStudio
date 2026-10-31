import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Team } from "@studio/shared";
import { useOfficeStore } from "../store/officeStore";
import type { AskingInfo } from "./asking";
import { SceneHtml } from "./SceneHtml";
import { readZoom } from "./CameraRig";
import { approachTile, cellOrigin, deskCenter, MAX_MEMBER_SEATS, POD, tileCenter } from "./layout";
import { STATUS_COLOR } from "./palette";
import { ceo, focus, hover } from "./runtime";

/** CEO within this many tiles of a desk's approach tile → "Làm việc với team" button. */
export const WORK_RADIUS = 1.5;
const NEAR_LABEL_RADIUS = 4;
/** Zoom (px per tile) from which labels also appear around the camera focus. */
const LABEL_ZOOM = 55;
/**
 * Label pool size. Overlay nodes are re-pointed, never unmounted while the office runs: unmounting
 * a drei <Html> during an R3F commit makes React log a synchronous-unmount race.
 */
const MAX_LABELS = 12;
/** Team sign: low, at the pod's front corner (nearest the camera, by the lead), clear of nameplates. */
const LABEL_Y = 0.3;
const LABEL_DX = POD.x + POD.w + 0.35;
const LABEL_DZ = POD.z + POD.d + 0.05;

interface View {
  labels: string[];
  near: string | null;
}

interface Props {
  teams: Team[];
  /** A team whose lead is asking shows its bubble instead of the label (no overlap). */
  asking: Map<string, AskingInfo>;
}

/**
 * Team name signs, "+N" badges for members beyond the pod's seats, and the work button. The label
 * set is computed on rendered frames and committed to React only when it changes, so DOM nodes
 * stay few and React stays idle while walking.
 */
export function DeskOverlays({ teams, asking }: Props) {
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
      if (asking.has(team.id)) continue;
      const d = deskCenter(team.slot);
      if (team.id === selectedTeamId || team.id === hover.teamId || Math.hypot(ceo.x - d.x, ceo.z - d.z) <= NEAR_LABEL_RADIUS) {
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

  // Freshly positioned Html nodes are placed on the next frame.
  useEffect(() => invalidate(), [view, invalidate]);

  const byId = new Map(teams.map((t) => [t.id, t]));
  const nearTeam = view.near ? byId.get(view.near) : undefined;
  /** Members beyond the pod's seats are counted on the team sign ("+N"), not floated in the air. */
  const extraOf = (team: Team | undefined) => Math.max(0, (team?.members?.length ?? 0) - MAX_MEMBER_SEATS);

  return (
    <>
      {Array.from({ length: MAX_LABELS }, (_, i) => {
        const id = view.labels[i];
        const team = id ? byId.get(id) : undefined;
        const o = team ? cellOrigin(team.slot) : { x: 0, z: 0 };
        return (
          <SceneHtml key={i} position={[o.x + LABEL_DX, LABEL_Y, o.z + LABEL_DZ]} center pointerEvents="none">
            <div className="scene-sign" hidden={!team} data-selected={team?.id === selectedTeamId}>
              <i style={{ background: team ? STATUS_COLOR[team.status] : undefined }} />
              {team?.projectName}
              {extraOf(team) > 0 && (
                <span className="scene-more" title={`${extraOf(team)} subagent khác đang chạy`}>+{extraOf(team)}</span>
              )}
            </div>
          </SceneHtml>
        );
      })}
      <WorkButton team={nearTeam} />
    </>
  );
}

function WorkButton({ team }: { team: Team | undefined }) {
  const a = team ? tileCenter(approachTile(team.slot)) : { x: 0, z: 0 };
  const open = () => {
    if (!team) return;
    const s = useOfficeStore.getState();
    s.selectTeam(team.id);
    s.openTerminal(team.id);
  };
  return (
    <SceneHtml position={[a.x, 0, a.z + 0.7]} center>
      <button type="button" className="scene-work" hidden={!team} onClick={open}>
        Làm việc với team
      </button>
    </SceneHtml>
  );
}
