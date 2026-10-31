import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { statsProbe } from "./counters";

/** Counts rendered frames and exposes the renderer for renderer.info. Mounted only with ?stats=1. */
export function StatsProbe() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    statsProbe.renderer = gl;
    return () => {
      statsProbe.renderer = null;
    };
  }, [gl]);
  useFrame(() => {
    statsProbe.frames += 1;
  });
  return null;
}
