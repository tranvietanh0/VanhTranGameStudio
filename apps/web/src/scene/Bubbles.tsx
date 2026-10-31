import { useRef } from "react";
import type { Team } from "@studio/shared";
import { useOfficeStore } from "../store/officeStore";
import { BUBBLE_PREFIX, type AskingInfo } from "./asking";
import { STAND_BACK } from "./crowd/sim";
import { chairPosition } from "./layout";
import { SceneHtml } from "./SceneHtml";

/** Anchor just above the standing lead's head (~0.83 tall); the bubble's tail points down at it. */
const BUBBLE_Y = 1.0;
/** Initial bubble pool; it only ever grows, so no <Html> is unmounted mid-commit (see DeskOverlays). */
const MIN_POOL = 4;

function openFor(team: Team, info: AskingInfo): void {
  const store = useOfficeStore.getState();
  if (info.questionId) {
    store.openQuestion(info.questionId);
    return;
  }
  store.selectTeam(team.id);
  store.openTerminal(team.id);
}

interface Props {
  teams: Team[];
  asking: Map<string, AskingInfo>;
}

/** Speech bubbles for asking leads, from a pool of mounted nodes that are re-pointed, not unmounted. */
export function Bubbles({ teams, asking }: Props) {
  const askingTeams = teams.filter((t) => asking.has(t.id));
  const pool = useRef(MIN_POOL);
  pool.current = Math.max(pool.current, askingTeams.length);
  return (
    <>
      {Array.from({ length: pool.current }, (_, i) => {
        const team = askingTeams[i];
        const info = team ? asking.get(team.id) : undefined;
        const chair = team ? chairPosition(team.slot) : { x: 0, z: 0 };
        return (
          <SceneHtml key={i} position={[chair.x, BUBBLE_Y, chair.z + STAND_BACK]}>
            <button
              type="button"
              className="scene-bubble"
              hidden={!team || !info}
              onClick={() => team && info && openFor(team, info)}
              title={team ? `${team.projectName}: trả lời` : undefined}
            >
              <span className="scene-bubble-team">{team?.projectName}</span>
              <span className="scene-bubble-title">{BUBBLE_PREFIX}</span>
              {info?.preview && <span className="scene-bubble-text">{info.preview}</span>}
            </button>
          </SceneHtml>
        );
      })}
    </>
  );
}
