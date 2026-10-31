import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, Object3D, type InstancedMesh } from "three";
import type { Team } from "@studio/shared";
import { useOfficeStore } from "../store/officeStore";
import { chairGeometry, deskGeometry, monitorGeometry, screenGeometry } from "./furniture";
import { capacityFor, commitColors, commitMatrices, ensureInstanceColor, MATERIALS } from "./instancing";
import { approachTile, chairPosition, deskCenter } from "./layout";
import { STATUS_COLOR } from "./palette";
import { CLICK_SLOP_PX, focusPoint, isTapSuppressed, walkToTile } from "./runtime";

const PULSE_HZ = 1.2;

const dummy = new Object3D();
const color = new Color();
const blockedDim = new Color(STATUS_COLOR.blocked).multiplyScalar(0.35);
const blockedLit = new Color(STATUS_COLOR.blocked);

/** CEO walks to the free tile behind the chair, camera flies to the desk, team is selected. */
export function goToTeam(team: Team): void {
  walkToTile(approachTile(team.slot));
  focusPoint(deskCenter(team.slot));
  useOfficeStore.getState().selectTeam(team.id);
}

interface Props {
  teams: Team[];
}

/** Desks, chairs, monitor frames and glowing screens: four instanced draw calls for any team count. */
export function Desks({ teams }: Props) {
  const desks = useRef<InstancedMesh>(null);
  const chairs = useRef<InstancedMesh>(null);
  const monitors = useRef<InstancedMesh>(null);
  const screens = useRef<InstancedMesh>(null);
  const capacity = capacityFor(teams.length);
  const blockedIdx = useMemo(() => teams.flatMap((t, i) => (t.status === "blocked" ? [i] : [])), [teams]);

  useLayoutEffect(() => {
    const meshes = [desks.current, chairs.current, monitors.current, screens.current];
    teams.forEach((team, i) => {
      const desk = deskCenter(team.slot);
      dummy.position.set(desk.x, 0, desk.z);
      dummy.updateMatrix();
      desks.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(desk.x, 0, desk.z - 0.22);
      dummy.updateMatrix();
      monitors.current?.setMatrixAt(i, dummy.matrix);
      screens.current?.setMatrixAt(i, dummy.matrix);
      const chair = chairPosition(team.slot);
      dummy.position.set(chair.x, 0, chair.z);
      dummy.updateMatrix();
      chairs.current?.setMatrixAt(i, dummy.matrix);
    });
    for (const m of meshes) if (m) commitMatrices(m, teams.length);
  }, [teams, capacity]);

  useLayoutEffect(() => {
    const mesh = screens.current;
    if (!mesh) return;
    ensureInstanceColor(mesh, capacity);
    teams.forEach((team, i) => mesh.setColorAt(i, color.set(STATUS_COLOR[team.status] ?? STATUS_COLOR.unknown)));
    commitColors(mesh);
  }, [teams, capacity]);

  useFrame(({ clock }) => {
    const mesh = screens.current;
    if (!mesh || blockedIdx.length === 0) return;
    const k = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * Math.PI * 2 * PULSE_HZ);
    color.copy(blockedDim).lerp(blockedLit, k);
    for (const i of blockedIdx) mesh.setColorAt(i, color);
    commitColors(mesh);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > CLICK_SLOP_PX || isTapSuppressed() || e.instanceId === undefined) return;
    const team = teams[e.instanceId];
    if (team) goToTeam(team);
  };

  return (
    <group>
      <instancedMesh key={`d${capacity}`} ref={desks} args={[deskGeometry(), MATERIALS.vertex, capacity]} onClick={onClick} />
      <instancedMesh key={`c${capacity}`} ref={chairs} args={[chairGeometry(), MATERIALS.vertex, capacity]} onClick={onClick} />
      <instancedMesh key={`m${capacity}`} ref={monitors} args={[monitorGeometry(), MATERIALS.vertex, capacity]} onClick={onClick} />
      <instancedMesh key={`s${capacity}`} ref={screens} args={[screenGeometry(), MATERIALS.screen, capacity]} onClick={onClick} />
    </group>
  );
}
