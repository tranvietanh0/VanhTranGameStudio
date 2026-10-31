import type { ClientMessage } from "@studio/shared";

/** Anything that can carry client messages to the server: the real WebSocket or the mock. */
export interface Transport {
  readonly name: "ws" | "mock";
  /** Returns false when the message could not be handed off (not connected). */
  send(msg: ClientMessage): boolean;
}

let active: Transport | null = null;

export function setTransport(transport: Transport | null): void {
  active = transport;
}

export function sendClient(msg: ClientMessage): boolean {
  return active?.send(msg) ?? false;
}
