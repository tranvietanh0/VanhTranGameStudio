import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "@studio/shared";
import { logError } from "./log.ts";

export interface ClientData {
  clientId: string;
}

export type ClientSocket = ServerWebSocket<ClientData>;

/** Set of connected WS clients with targeted and broadcast sends. */
export class Hub {
  private readonly clients = new Map<string, ClientSocket>();

  add(socket: ClientSocket): void {
    this.clients.set(socket.data.clientId, socket);
  }

  remove(clientId: string): void {
    this.clients.delete(clientId);
  }

  size(): number {
    return this.clients.size;
  }

  send(clientIds: Iterable<string>, message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const clientId of clientIds) {
      const socket = this.clients.get(clientId);
      if (!socket) continue;
      try {
        socket.send(payload);
      } catch (err) {
        logError("hub", `send to client ${clientId} failed`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  broadcast(message: ServerMessage): void {
    this.send(this.clients.keys(), message);
  }
}
