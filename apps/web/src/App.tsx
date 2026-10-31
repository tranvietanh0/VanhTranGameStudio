import { lazy, Suspense } from "react";
import { useOfficeStore } from "./store/officeStore";
import { UiLayer } from "./ui/UiLayer";

/** three.js + R3F live in their own chunk so the DOM UI paints before the 3D office loads. */
const OfficeScene = lazy(() => import("./scene/OfficeScene").then((m) => ({ default: m.OfficeScene })));
/** xterm is heavy: load the terminal panel only when a team terminal is first opened. */
const TerminalPanel = lazy(() => import("./terminal/TerminalPanel"));

/** Root: full-screen 3D office, DOM UI overlay on top, and the lazily loaded terminal panel. */
export function App() {
  const terminalTeamId = useOfficeStore((s) => s.terminalTeamId);
  return (
    <>
      <Suspense fallback={null}>
        <OfficeScene />
      </Suspense>
      <UiLayer />
      {terminalTeamId && (
        <Suspense fallback={null}>
          <TerminalPanel />
        </Suspense>
      )}
    </>
  );
}
