import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group } from "three";
import { useOfficeStore } from "../store/officeStore";
import { advanceAlongPath, screenToWorldDir, stepWithCollision, WALK_SPEED } from "./ceoMotion";
import { ceoGeometry } from "./furniture";
import { MATERIALS } from "./instancing";
import { ceo, focusCeo, getWalkGrid, keys, wakeScene } from "./runtime";
import { shadowPlane } from "./Shadows";

const KEY_MAP: Record<string, keyof typeof keys> = {
  KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
};
const TURN_RATE = 14;
const BOB_HEIGHT = 0.06;

/** Keys go to the CEO only when nothing else wants them (terminal, inputs, dialogs). */
function keyboardFree(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const el = e.target as HTMLElement | null;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return false;
  const s = useOfficeStore.getState();
  return s.activeQuestionId === null && !s.addTeamOpen;
}

function useMovementKeys(): void {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = KEY_MAP[e.code];
      if (!k || !keyboardFree(e)) return;
      e.preventDefault();
      if (!keys[k]) {
        keys[k] = true;
        ceo.path = [];
        focusCeo();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = KEY_MAP[e.code];
      if (k) keys[k] = false;
    };
    const clear = () => {
      keys.up = keys.down = keys.left = keys.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, []);
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The CEO avatar: A* path following, WASD/arrows with wall sliding, walk bob, turn smoothing. */
export function Ceo() {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  useMovementKeys();

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const right = Number(keys.right) - Number(keys.left);
    const up = Number(keys.up) - Number(keys.down);
    const grid = getWalkGrid();
    let moving = false;
    let heading: number | null = null;

    if ((right !== 0 || up !== 0) && grid) {
      const dir = screenToWorldDir(right, up);
      const next = stepWithCollision(grid, ceo, dir.x * WALK_SPEED * dt, dir.z * WALK_SPEED * dt);
      ceo.x = next.x;
      ceo.z = next.z;
      heading = Math.atan2(dir.x, dir.z);
      moving = true;
    } else if (ceo.path.length > 0) {
      const step = advanceAlongPath(ceo, ceo.path, WALK_SPEED * dt);
      ceo.x = step.x;
      ceo.z = step.z;
      ceo.path = step.path;
      heading = step.heading;
      moving = true;
    }

    const turn = heading === null ? 0 : shortestAngle(ceo.heading, heading);
    ceo.heading += turn * Math.min(1, dt * TURN_RATE);
    ceo.moving = moving;
    ceo.bobPhase = moving ? ceo.bobPhase + dt * 13 : 0;

    const g = group.current;
    if (g) {
      g.position.set(ceo.x, 0, ceo.z);
      g.rotation.y = ceo.heading;
    }
    if (body.current) body.current.position.y = Math.abs(Math.sin(ceo.bobPhase)) * BOB_HEIGHT;
    if (moving || Math.abs(turn) > 0.01) state.invalidate();
  });

  // Keys pressed while the tab was hidden or a frame was missed: make sure we start moving.
  useEffect(() => wakeScene(), []);

  return (
    <group ref={group}>
      <group ref={body}>
        <mesh geometry={ceoGeometry()} material={MATERIALS.vertex} raycast={() => null} />
      </group>
      <mesh geometry={shadowPlane()} material={MATERIALS.shadow} scale={[0.9, 1, 0.9]} renderOrder={1} raycast={() => null} />
    </group>
  );
}
