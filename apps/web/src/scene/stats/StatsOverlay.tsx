import { useEffect, useRef, useState } from "react";
import { statsProbe } from "./counters";

const SAMPLE_MS = 500;
const MB = 1024 * 1024;

interface Sample {
  fps: number;
  frames: number;
  calls: number;
  triangles: number;
  heapMb: number | null;
}

/** Chrome-only performance.memory; absent elsewhere, so the heap row then shows "n/a". */
function heapMb(): number | null {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? mem.usedJSHeapSize / MB : null;
}

/** Dev stats panel (?stats=1): fps, rendered-frame counter, draw calls, triangles, JS heap. */
export function StatsOverlay() {
  const [s, setS] = useState<Sample>({ fps: 0, frames: 0, calls: 0, triangles: 0, heapMb: null });
  const last = useRef({ frames: 0, at: performance.now() });

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      const frames = statsProbe.frames;
      const fps = ((frames - last.current.frames) * 1000) / Math.max(1, now - last.current.at);
      last.current = { frames, at: now };
      const info = statsProbe.renderer?.info.render;
      setS({ fps, frames, calls: info?.calls ?? 0, triangles: info?.triangles ?? 0, heapMb: heapMb() });
    }, SAMPLE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <pre className="scene-stats" data-testid="scene-stats">
      {`fps    ${s.fps.toFixed(1)}
frames ${s.frames}
calls  ${s.calls}
tris   ${s.triangles}
heap   ${s.heapMb === null ? "n/a" : `${s.heapMb.toFixed(1)} MB`}`}
    </pre>
  );
}
