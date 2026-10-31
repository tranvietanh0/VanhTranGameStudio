import type { ServerMessage } from "@studio/shared";

export type TerminalFrame = Extract<ServerMessage, { type: "terminal.frame" }>;
export type TerminalClosed = Extract<ServerMessage, { type: "terminal.closed" }>;

export interface TerminalListener {
  onFrame: (frame: TerminalFrame) => void;
  onClosed: (closed: TerminalClosed) => void;
}

/**
 * Terminal output does not belong in the zustand store: it is high-rate byte data consumed by
 * exactly one xterm instance. The bus fans it out to whichever panel is currently subscribed.
 */
const listeners = new Set<TerminalListener>();

export function subscribeTerminal(listener: TerminalListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitTerminalFrame(frame: TerminalFrame): void {
  for (const listener of listeners) listener.onFrame(frame);
}

export function emitTerminalClosed(closed: TerminalClosed): void {
  for (const listener of listeners) listener.onClosed(closed);
}
