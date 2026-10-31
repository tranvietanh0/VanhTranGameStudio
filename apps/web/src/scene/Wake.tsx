import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { useOfficeStore } from "../store/officeStore";
import { bindWake } from "./runtime";

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
