import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";
import { useOfficeStore } from "../store/officeStore";
import { PromptBar } from "./PromptBar";
import { useTerminalSession } from "./useTerminalSession";

export default function TerminalPanel() {
  const teamId = useOfficeStore((s) => s.terminalTeamId);
  if (!teamId) return null;
  return <TerminalDrawer key={teamId} teamId={teamId} />;
}

function TerminalDrawer({ teamId }: { teamId: string }) {
  const team = useOfficeStore((s) => s.teams[teamId]);
  const openTerminal = useOfficeStore((s) => s.openTerminal);
  const containerRef = useRef<HTMLDivElement>(null);
  const { closedReason, focus } = useTerminalSession(teamId, containerRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // While the terminal is focused, Esc belongs to the app running inside it.
      if (containerRef.current?.contains(document.activeElement)) return;
      openTerminal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTerminal]);

  return (
    <aside className="term-drawer" aria-label="Terminal">
      <header className="term-header">
        <span className="term-dot" data-status={team?.status ?? "unknown"} />
        <strong>{team?.projectName ?? teamId}</strong>
        <span className="term-status">{team?.status ?? ""}</span>
        <button type="button" className="term-close" onClick={() => openTerminal(null)} aria-label="Đóng terminal">
          ✕
        </button>
      </header>
      <div className="term-body" onClick={focus}>
        <div className="term-host" ref={containerRef} />
        {closedReason !== null && <div className="term-overlay">Phiên terminal đã đóng: {closedReason}</div>}
      </div>
      <PromptBar teamId={teamId} />
    </aside>
  );
}
