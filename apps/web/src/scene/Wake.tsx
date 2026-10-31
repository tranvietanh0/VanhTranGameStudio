import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { useOfficeStore } from "../store/officeStore";
import { bindWake } from "./runtime";

/** Frame interval for idle-ish animation (blocked pulse, raised-hand wave): 10 fps. */
export const PULSE_INTERVAL_MS = 100;

/**
 * Demand-mode wiring: binds runtime.wakeScene to invalidate(), renders one frame per store
 * revision, and repaints when the tab becomes visible again. No timers run while idle.
 */
export function SceneWake() {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    bindWake(() => invalidate());
    return () => bindWake(null);
  }, [invalidate]);

  useEffect(
    () =>
      useOfficeStore.subscribe((s, prev) => {
        if (s.revision !== prev.revision || s.selectedTeamId !== prev.selectedTeamId) invalidate();
      }),
    [invalidate],
  );

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) invalidate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [invalidate]);

  return null;
}

/**
 * Throttled frames while at least one lead is asking. Mounted only in that state; skips ticks
 * while the tab is hidden so a background tab renders nothing.
 */
export function PulseTicker({ active }: { active: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (!document.hidden) invalidate();
    }, PULSE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active, invalidate]);
  return null;
}
