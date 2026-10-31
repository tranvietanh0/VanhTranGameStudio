import { loadConfig } from "./config.ts";
import type { ClientData } from "./hub.ts";
import { createHttpHandler } from "./http.ts";
import { logInfo, logWarn } from "./log.ts";
import { createServices, startServices, stopServices } from "./services.ts";
import { createWsHandler } from "./ws.ts";
import { isLoopback } from "./auth.ts";

const config = loadConfig();
const services = createServices(config);

const server = Bun.serve<ClientData>({
  hostname: config.bind,
  port: config.port,
  fetch: createHttpHandler({
    token: config.token,
    webDist: config.webDist,
    onHook: (event) => services.tracker.onHookEvent(event),
  }),
  websocket: createWsHandler(services),
});

startServices(services);

if (!isLoopback(config.bind)) {
  logWarn("studio", `bound to ${config.bind}, not loopback; only expose it over a private network such as Tailscale`);
}
logInfo("studio", `listening on http://${config.bind}:${server.port}/?token=${config.token}`);
logInfo("studio", "herdr sync started; teams appear once herdr is reachable");

const shutdown = (): void => {
  stopServices(services);
  server.stop(true);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
