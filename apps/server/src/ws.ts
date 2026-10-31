import type { WebSocketHandler } from "bun";
import type { ClientData } from "./hub.ts";
import { logInfo } from "./log.ts";
import { handleClientMessage } from "./router.ts";
import type { StudioServices } from "./services.ts";

/** WS lifecycle: hello on connect, routed messages in, cleanup on disconnect. */
export function createWsHandler(services: StudioServices): WebSocketHandler<ClientData> {
  return {
    open(ws) {
      const { clientId } = ws.data;
      services.hub.add(ws);
      services.hub.send([clientId], {
        type: "hello",
        teams: services.registry.list(),
        questions: services.tracker.list(),
        herdrConnected: services.sync.isConnected(),
      });
      logInfo("ws", "client connected", { clients: services.hub.size() });
    },
    message(ws, message) {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      void handleClientMessage(services, ws.data.clientId, text);
    },
    close(ws) {
      const { clientId } = ws.data;
      services.bridge.dropClient(clientId);
      services.hub.remove(clientId);
      logInfo("ws", "client disconnected", { clients: services.hub.size() });
    },
  };
}
