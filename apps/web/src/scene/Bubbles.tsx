import { Html } from "@react-three/drei";
import type { Team } from "@studio/shared";
import { useOfficeStore } from "../store/officeStore";
import { BUBBLE_PREFIX, type AskingInfo } from "./asking";
import { chairPosition } from "./layout";

/** Keep scene overlays under the DOM UI layer (z-index 10). */
export const OVERLAY_Z: [number, number] = [5, 0];
const BUBBLE_Y = 2.55;

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

/** Speech bubbles, one DOM node per asking lead only (usually a handful). */
export function Bubbles({ teams, asking }: Props) {
  return (
    <>
      {teams.map((team) => {
        const info = asking.get(team.id);
        if (!info) return null;
        const chair = chairPosition(team.slot);
        return (
          <Html key={team.id} position={[chair.x, BUBBLE_Y, chair.z + 0.5]} center zIndexRange={OVERLAY_Z}>
            <button
              type="button"
              className="scene-bubble"
              onClick={() => openFor(team, info)}
              title={`${team.projectName}: trả lời`}
            >
              <span className="scene-bubble-title">{BUBBLE_PREFIX}</span>
              {info.preview && <span className="scene-bubble-text">{info.preview}</span>}
            </button>
          </Html>
        );
      })}
    </>
  );
}
