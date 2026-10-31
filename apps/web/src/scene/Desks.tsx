import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, Matrix4, Object3D, PlaneGeometry, type InstancedMesh } from "three";
import type { Team } from "@studio/shared";
import { useOfficeStore } from "../store/officeStore";
import { capacityFor, commitColors, commitMatrices, ensureInstanceColor, MATERIALS } from "./instancing";
import { approachTile, cellOrigin, deskCenter, POD, seatOf, SEATS_PER_POD } from "./layout";
import type { SeatAssignment } from "./members";
import { screenMatrix } from "./officeBuild";
import { PALETTE, STATUS_COLOR } from "./palette";
import { CLICK_SLOP_PX, focusPoint, isTapSuppressed, setHoverTeam, walkToTile } from "./runtime";

const PULSE_HZ = 1.2;

const dummy = new Object3D();
const m = new Matrix4();
const color = new Color();
const blockedDim = new Color(STATUS_COLOR.blocked).multiplyScalar(0.35);
const blockedLit = new Color(STATUS_COLOR.blocked);
const screenGeo = new PlaneGeometry(1, 1);
const hitGeo = new BoxGeometry(1, 1, 1);

/** CEO walks to the free tile behind the lead's chair, camera flies to the pod, team is selected. */
export function goToTeam(team: Team): void {
  walkToTile(approachTile(team.slot));
  focusPoint(deskCenter(team.slot));
  useOfficeStore.getState().selectTeam(team.id);
}

interface Props {
  teams: Team[];
  seats: Map<string, SeatAssignment>;
}

/**
 * Monitor screens of every pod (one instanced, unlit draw call): the lead's screen glows in the
 * team's status colour, members' screens light up while their seat is taken. Invisible pod hit
 * boxes (no draw call) make a click anywhere on a pod open that team.
 */
export function Desks({ teams, seats }: Props) {
  const screens = useRef<InstancedMesh>(null);
  const hits = useRef<InstancedMesh>(null);
  const screenCount = teams.length * SEATS_PER_POD;
  const screenCap = capacityFor(screenCount);
  const hitCap = capacityFor(teams.length);
  const blockedIdx = useMemo(() => teams.flatMap((t, i) => (t.status === "blocked" ? [i * SEATS_PER_POD] : [])), [teams]);

  useLayoutEffect(() => {
    const s = screens.current;
    const h = hits.current;
    if (!s || !h) return;
    teams.forEach((team, t) => {
      for (let i = 0; i < SEATS_PER_POD; i++) s.setMatrixAt(t * SEATS_PER_POD + i, screenMatrix(seatOf(team.slot, i), m));
      const o = cellOrigin(team.slot);
      dummy.position.set(o.x + POD.x + POD.w / 2, 0.5, o.z + POD.z + POD.d / 2);
      dummy.scale.set(POD.w, 1, POD.d);
      dummy.updateMatrix();
      h.setMatrixAt(t, dummy.matrix);
    });
    commitMatrices(s, screenCount);
    commitMatrices(h, teams.length);
  }, [teams, screenCount, screenCap, hitCap]);

  useLayoutEffect(() => {
    const s = screens.current;
    if (!s) return;
    ensureInstanceColor(s, screenCap);
    teams.forEach((team, t) => {
      s.setColorAt(t * SEATS_PER_POD, color.set(STATUS_COLOR[team.status] ?? STATUS_COLOR.unknown));
      const taken = new Set(seats.get(team.id)?.seats.values() ?? []);
      for (let i = 1; i < SEATS_PER_POD; i++) {
        s.setColorAt(t * SEATS_PER_POD + i, color.set(taken.has(i) ? PALETTE.screenMember : PALETTE.screenOff));
      }
    });
    commitColors(s);
  }, [teams, seats, screenCap]);

  useFrame(({ clock }) => {
    const s = screens.current;
    if (!s || blockedIdx.length === 0) return;
    const k = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * Math.PI * 2 * PULSE_HZ);
    color.copy(blockedDim).lerp(blockedLit, k);
    for (const i of blockedIdx) s.setColorAt(i, color);
    commitColors(s);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > CLICK_SLOP_PX || isTapSuppressed() || e.instanceId === undefined) return;
    const team = teams[e.instanceId];
    if (team) goToTeam(team);
  };

  const onHover = (e: ThreeEvent<PointerEvent>) => {
    if (e.pointerType !== "mouse" || e.instanceId === undefined) return;
    setHoverTeam(teams[e.instanceId]?.id ?? null);
  };

  return (
    <group>
      <instancedMesh key={`s${screenCap}`} ref={screens} args={[screenGeo, MATERIALS.screen, screenCap]} raycast={() => null} />
      <instancedMesh
        key={`h${hitCap}`}
        ref={hits}
        args={[hitGeo, MATERIALS.hit, hitCap]}
        onClick={onClick}
        onPointerMove={onHover}
        onPointerOut={() => setHoverTeam(null)}
      />
    </group>
  );
}
