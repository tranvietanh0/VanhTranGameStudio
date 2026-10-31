// Manual integration check against the REAL herdr server. Not run by `bun test`.
// Run: bun apps/server/test/integration.manual.ts
// Creates a workspace labelled "studio-test", checks team.upsert arrives < 500ms, opens its
// terminal, types `echo studio-ok`, sees the output, then closes the workspace (in finally).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerMessage } from "@studio/shared";
import { loadConfig } from "../src/config.ts";
import { herdrCall } from "../src/herdr/rpc.ts";
import { createHttpHandler } from "../src/http.ts";
import type { ClientData } from "../src/hub.ts";
import { createServices, startServices, stopServices } from "../src/services.ts";
import { createWsHandler } from "../src/ws.ts";

const UPSERT_BUDGET_MS = 500;
const LABEL = "studio-test";

interface Timed {
  at: number;
  msg: ServerMessage;
}

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

const received: Timed[] = [];
const outputByTeam = new Map<string, string>();
const ws = new WebSocket(`ws://${config.bind}:${server.port}/ws?token=${config.token}`);
ws.onmessage = (event) => {
  const msg = JSON.parse(String(event.data)) as ServerMessage;
  received.push({ at: performance.now(), msg });
  if (msg.type === "terminal.frame") {
    const prev = outputByTeam.get(msg.teamId) ?? "";
    outputByTeam.set(msg.teamId, prev + Buffer.from(msg.data, "base64").toString("utf8"));
  }
};

const dir = mkdtempSync(join(tmpdir(), "studio-test-"));
let workspaceId: string | null = null;

function step(message: string): void {
  console.log(`[integration] ${message}`);
}

async function waitFor(predicate: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (predicate()) return;
    await Bun.sleep(25);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function find(predicate: (m: ServerMessage) => boolean): Timed | undefined {
  return received.find((t) => predicate(t.msg));
}

function send(message: unknown): void {
  ws.send(JSON.stringify(message));
}

const b64 = (text: string): string => Buffer.from(text, "utf8").toString("base64");

try {
  await waitFor(() => ws.readyState === WebSocket.OPEN, 5000, "WS open");
  await waitFor(() => services.sync.isConnected(), 5000, "herdr connection");
  step("herdr connected, WS open");

  const created = await herdrCall<{ root_pane: { pane_id: string } ; workspace: { workspace_id: string } }>(
    "workspace.create",
    { label: LABEL, cwd: dir, focus: false },
  );
  workspaceId = created.workspace.workspace_id;
  const paneId = created.root_pane.pane_id;
  const t0 = performance.now();

  await waitFor(() => find((m) => m.type === "team.upsert" && m.team.id === paneId) !== undefined, 5000, "team.upsert");
  const upsertMs = (find((m) => m.type === "team.upsert" && m.team.id === paneId)?.at ?? t0) - t0;
  step(`team.upsert for ${paneId} after ${upsertMs.toFixed(0)}ms (budget ${UPSERT_BUDGET_MS}ms): ${upsertMs < UPSERT_BUDGET_MS ? "PASS" : "FAIL"}`);

  send({ type: "terminal.open", teamId: paneId, cols: 100, rows: 30 });
  await waitFor(() => outputByTeam.has(paneId), 8000, "first terminal frame");
  step("terminal stream opened, first frame received");
  // The new shell draws its prompt after the first frame; typing before that can be lost.
  await Bun.sleep(1500);

  const marker = "studio-ok";
  send({ type: "terminal.input", teamId: paneId, data: b64(`echo ${marker}\r`) });
  const countMarker = () => (outputByTeam.get(paneId) ?? "").split(marker).length - 1;
  await waitFor(() => countMarker() >= 2, 8000, "echoed command and its output");
  step(`typed echo ${marker}; output seen (${countMarker()} occurrences): PASS`);

  send({ type: "terminal.close", teamId: paneId });
  await herdrCall("workspace.close", { workspace_id: workspaceId });
  workspaceId = null;
  await waitFor(() => find((m) => m.type === "team.remove" && m.teamId === paneId) !== undefined, 5000, "team.remove");
  step("workspace closed, team.remove received: PASS");
} finally {
  if (workspaceId) {
    try {
      await herdrCall("workspace.close", { workspace_id: workspaceId });
      step(`cleanup closed workspace ${workspaceId}`);
    } catch (err) {
      console.error("[integration] cleanup FAILED; close studio-test manually:", err);
    }
  }
  ws.close();
  stopServices(services);
  server.stop(true);
  rmSync(dir, { recursive: true, force: true });
}
process.exit(0);
