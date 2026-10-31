import { useFrame } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useRef } from "react";
import { Color, Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import type { Team } from "@studio/shared";
import type { AskingInfo } from "./asking";
import { leadArmGeometry, leadBodyGeometry, leadHairGeometry, leadHeadGeometry } from "./furniture";
import { capacityFor, commitColors, commitMatrices, ensureInstanceColor, MATERIALS } from "./instancing";
import { chairPosition } from "./layout";
import { hashString, PALETTE, pick } from "./palette";

const SEATED_HIPS_Y = 0.5;
const STANDING_HIPS_Y = 0.6;
const STAND_FORWARD = 0.5;
const HEAD_Y = 0.83;
const SHOULDER = new Vector3(0.23, 0.56, 0);
const WAVE_HZ = 1.6;

const base = new Matrix4();
const local = new Matrix4();
const out = new Matrix4();
const q = new Quaternion();
const euler = new Euler();
const one = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);
const pos = new Vector3();
const color = new Color();

interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

function poseFor(team: Team, asking: boolean): Pose {
  const chair = chairPosition(team.slot);
  return asking
    ? { x: chair.x, y: STANDING_HIPS_Y, z: chair.z + STAND_FORWARD, yaw: 0 }
    : { x: chair.x, y: SEATED_HIPS_Y, z: chair.z - 0.04, yaw: Math.PI };
}

function writeArm(mesh: InstancedMesh, i: number, side: 1 | -1, rx: number, rz: number): void {
  local.compose(pos.set(SHOULDER.x * side, SHOULDER.y, SHOULDER.z), q.setFromEuler(euler.set(rx, 0, rz)), one);
  mesh.setMatrixAt(i, out.multiplyMatrices(base, local));
}

interface Props {
  teams: Team[];
  asking: Map<string, AskingInfo>;
}

/**
 * One seated lead per desk (body, head, hair, two arms = five instanced draw calls). A lead whose
 * team is asking stands up, turns to the camera and waves one raised arm.
 */
export function Leads({ teams, asking }: Props) {
  const body = useRef<InstancedMesh>(null);
  const head = useRef<InstancedMesh>(null);
  const hair = useRef<InstancedMesh>(null);
  const armL = useRef<InstancedMesh>(null);
  const armR = useRef<InstancedMesh>(null);
  const capacity = capacityFor(teams.length);

  const writePoses = useCallback(
    (t: number) => {
      const [b, h, hr, l, r] = [body.current, head.current, hair.current, armL.current, armR.current];
      if (!b || !h || !hr || !l || !r) return;
      teams.forEach((team, i) => {
        const isAsking = asking.has(team.id);
        const p = poseFor(team, isAsking);
        base.compose(pos.set(p.x, p.y, p.z), q.setFromAxisAngle(UP, p.yaw), one);
        b.setMatrixAt(i, base);
        local.makeTranslation(0, HEAD_Y, 0);
        out.multiplyMatrices(base, local);
        h.setMatrixAt(i, out);
        hr.setMatrixAt(i, out);
        if (isAsking) {
          const wave = Math.sin(t * Math.PI * 2 * WAVE_HZ + i) * 0.28;
          writeArm(l, i, 1, 0, 0.12);
          writeArm(r, i, -1, 0, -(2.65 + wave));
        } else {
          const type = Math.sin(t * 9 + i * 1.7) * 0.04;
          writeArm(l, i, 1, -1.05 + type, 0.1);
          writeArm(r, i, -1, -1.05 - type, -0.1);
        }
      });
      for (const m of [b, h, hr, l, r]) commitMatrices(m, teams.length);
    },
    [teams, asking],
  );

  useLayoutEffect(() => {
    const meshes = [body.current, head.current, hair.current, armL.current, armR.current];
    for (const m of meshes) if (m) ensureInstanceColor(m, capacity);
    teams.forEach((team, i) => {
      const seed = hashString(team.id);
      const shirt = color.set(pick(PALETTE.shirts, seed));
      body.current?.setColorAt(i, shirt);
      armL.current?.setColorAt(i, shirt);
      armR.current?.setColorAt(i, shirt);
      head.current?.setColorAt(i, color.set(pick(PALETTE.skin, seed >>> 3)));
      hair.current?.setColorAt(i, color.set(pick(PALETTE.hair, seed >>> 6)));
    });
    for (const m of meshes) if (m) commitColors(m);
    writePoses(0);
  }, [teams, capacity, writePoses]);

  // Only animate while someone is asking; the throttled ticker supplies those frames.
  useFrame(({ clock }) => {
    if (asking.size > 0) writePoses(clock.getElapsedTime());
  });

  const geo = { body: leadBodyGeometry(), head: leadHeadGeometry(), hair: leadHairGeometry(), arm: leadArmGeometry() };
  return (
    <group>
      <instancedMesh key={`b${capacity}`} ref={body} args={[geo.body, MATERIALS.plain, capacity]} raycast={() => null} />
      <instancedMesh key={`h${capacity}`} ref={head} args={[geo.head, MATERIALS.plain, capacity]} raycast={() => null} />
      <instancedMesh key={`r${capacity}`} ref={hair} args={[geo.hair, MATERIALS.plain, capacity]} raycast={() => null} />
      <instancedMesh key={`l${capacity}`} ref={armL} args={[geo.arm, MATERIALS.plain, capacity]} raycast={() => null} />
      <instancedMesh key={`a${capacity}`} ref={armR} args={[geo.arm, MATERIALS.plain, capacity]} raycast={() => null} />
    </group>
  );
}
