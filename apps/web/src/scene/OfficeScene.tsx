import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { loadRuntimeConfig } from "../net/config";
import { BACKGROUND } from "./instancing";
import { Office } from "./Office";
import { StatsOverlay } from "./stats/StatsOverlay";
import { StatsProbe } from "./stats/StatsProbe";
import "./scene.css";

interface Quality {
  dpr: [number, number];
  antialias: boolean;
}

/** Phones / tablets / narrow windows: DPR ≤ 1.5 and no MSAA (perf budget, plan "Mobile"). */
function detectQuality(): Quality {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const small = window.innerWidth < 768;
  return coarse || small ? { dpr: [1, 1.5], antialias: false } : { dpr: [1, 2], antialias: true };
}

/**
 * Full-screen 3D office. Demand frameloop: frames are rendered only on data changes, camera
 * tweens, CEO movement and (throttled) while a lead is asking; zero frames when idle.
 */
export function OfficeScene() {
  const quality = useMemo(detectQuality, []);
  const showStats = useMemo(() => loadRuntimeConfig().showStats, []);

  return (
    <div className="scene-root">
      <Canvas
        frameloop="demand"
        orthographic
        flat
        dpr={quality.dpr}
        gl={{ antialias: quality.antialias, powerPreference: "high-performance", stencil: false }}
        camera={{ zoom: 40, near: 0.1, far: 200, position: [30, 25, 30] }}
      >
        <color attach="background" args={[BACKGROUND]} />
        <Office />
        {showStats && <StatsProbe />}
      </Canvas>
      {showStats && <StatsOverlay />}
    </div>
  );
}
