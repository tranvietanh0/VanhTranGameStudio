import { buildWsUrl, type RuntimeConfig } from "./config";
import { applyServerMessage } from "./dispatch";
import { startMock } from "./mockDriver";
import { setTransport } from "./transport";
import { WsClient } from "./wsClient";
import { useOfficeStore } from "../store/officeStore";

/** Starts either the real WebSocket or the mock office. Returns a stop function. */
export function startConnection(config: RuntimeConfig): () => void {
  if (config.mockTeams !== null) return startMock(config.mockTeams);

  const client = new WsClient({
    url: () => buildWsUrl(config.token),
    onMessage: applyServerMessage,
    onStatus: (status, attempt) => useOfficeStore.getState().setConnection(status, attempt),
  });
  setTransport(client);
  client.start();
  return () => {
    client.stop();
    setTransport(null);
  };
}
