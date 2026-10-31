import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Frustum, Matrix4, type Group } from "three";
import type { Team } from "@studio/shared";
import type { AskingInfo } from "../asking";
import type { SeatAssignment } from "../members";
import type { Grid } from "../pathfinding";
import { setTickSource } from "../runtime";
import { planCrowd } from "./plan";
import { buildLibrary, CHARACTERS_URL } from "./rig";
import { CrowdSim, type FrameContext } from "./sim";

/** The live simulation, read by overlays (nameplates) on rendered frames. */
export const crowdRuntime: { sim: CrowdSim | null } = { sim: null };

const MAX_DT = 0.1;
const projView = new Matrix4();

interface Props {
  teams: Team[];
  asking: Map<string, AskingInfo>;
  seats: Map<string, SeatAssignment>;
  grid: Grid;
}

/**
 * All animated characters. Renders one instanced draw call per character variant in use plus one
 * for contact shadows. Requests frames only while someone walks (every frame) or a visible
 * character types/waves (throttled ticks); otherwise the office stays at 0 fps.
 */
export function Crowd({ teams, asking, seats, grid }: Props) {
  const gltf = useGLTF(CHARACTERS_URL, false);
  const lib = useMemo(() => buildLibrary(gltf.scene, gltf.animations), [gltf]);
  const group = useRef<Group>(null);
  const sim = useRef<CrowdSim | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const specs = useMemo(() => planCrowd(teams, seats), [teams, seats]);
  const ctx = useRef<FrameContext>({ frustum: new Frustum(), grid, asking: new Set(), status: new Map() });

  ctx.current.grid = grid;
  ctx.current.asking = new Set(asking.keys());
  ctx.current.status = new Map(teams.map((t) => [t.id, t.status]));

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    const s = new CrowdSim(lib, g);
    sim.current = s;
    crowdRuntime.sim = s;
    return () => {
      s.dispose();
      sim.current = null;
      if (crowdRuntime.sim === s) crowdRuntime.sim = null;
    };
  }, [lib]);

  useLayoutEffect(() => {
    sim.current?.sync(specs, grid);
    invalidate();
  }, [specs, grid, lib, invalidate]);

  useEffect(() => () => setTickSource("crowd", false), []);

  useFrame((state, rawDt) => {
    const s = sim.current;
    if (!s) return;
    const cam = state.camera;
    cam.updateMatrixWorld();
    projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    ctx.current.frustum.setFromProjectionMatrix(projView);
    const r = s.update(Math.min(rawDt, MAX_DT), ctx.current);
    if (r.walking) state.invalidate();
    setTickSource("crowd", r.ticking);
  });

  return <group ref={group} />;
}

useGLTF.preload(CHARACTERS_URL, false);
