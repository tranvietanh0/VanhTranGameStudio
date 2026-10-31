import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { statsProbe } from "./counters";

/** Counts rendered frames and exposes the renderer for renderer.info. Mounted only with ?stats=1. */
export function StatsProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    statsProbe.renderer = gl;
    statsProbe.scene = scene;
    // ?stats=1 only: lets measurement scripts reach the probe without importing app modules.
    (window as Window & { __officeStats?: typeof statsProbe }).__officeStats = statsProbe;
    return () => {
      statsProbe.renderer = null;
      statsProbe.scene = null;
    };
  }, [gl, scene]);
  useFrame(() => {
    statsProbe.frames += 1;
  });
  return null;
}
