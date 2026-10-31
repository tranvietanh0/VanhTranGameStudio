import { useEffect, useRef, useState, type RefObject } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { subscribeTerminal } from "../net/terminalBus";
import { sendClient } from "../net/transport";
import { base64ToBytes, textToBase64 } from "./base64";
import { TERMINAL_THEME } from "./theme";

const RESIZE_DEBOUNCE_MS = 100;
const FONT_FAMILY = '"Cascadia Mono", Consolas, monospace';

let webglWarned = false;
function warnWebglOnce(reason: unknown): void {
  if (webglWarned) return;
  webglWarned = true;
  console.warn("[terminal] WebGL renderer unavailable, using DOM renderer", reason);
}

/**
 * Owns the single xterm instance for `teamId`. The effect re-runs (disposing the old instance and
 * sending terminal.close for the old team) whenever the team changes; everything created here is
 * released in the cleanup.
 */
export function useTerminalSession(teamId: string, containerRef: RefObject<HTMLDivElement | null>) {
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const focusRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setClosedReason(null);

    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: 14,
      cursorBlink: true,
      scrollback: 5000,
      theme: TERMINAL_THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    let webgl: WebglAddon | null = null;
    const disposeWebgl = () => {
      webgl?.dispose();
      webgl = null;
    };
    try {
      webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        warnWebglOnce("context loss");
        disposeWebgl();
      });
      term.loadAddon(webgl);
    } catch (err) {
      warnWebglOnce(err);
      disposeWebgl();
    }

    // Ctrl+C with a selection copies instead of sending SIGINT; every other key goes to herdr.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "c" && term.hasSelection()) {
        void navigator.clipboard?.writeText(term.getSelection()).catch(() => undefined);
        return false;
      }
      return true;
    });

    const safeFit = () => {
      try {
        fit.fit();
      } catch (err) {
        console.warn("[terminal] fit failed", err);
      }
    };
    safeFit();
    let lastCols = term.cols;
    let lastRows = term.rows;
    sendClient({ type: "terminal.open", teamId, cols: lastCols, rows: lastRows });
    focusRef.current = () => term.focus();
    term.focus();

    const dataSub = term.onData((d) => sendClient({ type: "terminal.input", teamId, data: textToBase64(d) }));

    // herdr full frames repaint the whole screen, so every frame (full or not) is just written.
    const unsubscribe = subscribeTerminal({
      onFrame: (frame) => {
        if (frame.teamId !== teamId) return;
        try {
          term.write(base64ToBytes(frame.data));
        } catch (err) {
          console.warn("[terminal] dropped malformed frame", err);
        }
      },
      onClosed: (closed) => {
        if (closed.teamId === teamId) setClosedReason(closed.reason);
      },
    });

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        safeFit();
        if (term.cols === lastCols && term.rows === lastRows) return;
        lastCols = term.cols;
        lastRows = term.rows;
        sendClient({ type: "terminal.resize", teamId, cols: lastCols, rows: lastRows });
      }, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      unsubscribe();
      dataSub.dispose();
      sendClient({ type: "terminal.close", teamId });
      disposeWebgl();
      fit.dispose();
      term.dispose();
      focusRef.current = () => undefined;
    };
  }, [teamId, containerRef]);

  return { closedReason, focus: () => focusRef.current() };
}
