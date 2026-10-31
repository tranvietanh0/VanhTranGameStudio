import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { NeutralToneMapping, SRGBColorSpace } from "three";
import { loadRuntimeConfig } from "../net/config";
import { BACKGROUND } from "./instancing";
import { Office } from "./Office";
import { StatsOverlay } from "./stats/StatsOverlay";
import { StatsProbe } from "./stats/StatsProbe";
import "./scene.css";

/** Neutral tone mapping keeps the palette's hues (ACES pushed the oak floor towards orange). */
const TONE_EXPOSURE = 1;

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
 * tweens, walking characters and (throttled ~15 fps) while a visible character types or waves;
 * zero frames when idle. Neutral tone mapping, sRGB output, static soft shadow map.
 */
export function OfficeScene() {
  const quality = useMemo(detectQuality, []);
  const showStats = useMemo(() => loadRuntimeConfig().showStats, []);

  return (
    <div className="scene-root">
      <Canvas
        frameloop="demand"
        orthographic
        shadows="percentage"
        dpr={quality.dpr}
        gl={{ antialias: quality.antialias, powerPreference: "high-performance", stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = NeutralToneMapping;
          gl.toneMappingExposure = TONE_EXPOSURE;
          gl.outputColorSpace = SRGBColorSpace;
          // The shadow map is static: Lights re-renders it once per layout change.
          gl.shadowMap.autoUpdate = false;
        }}
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
