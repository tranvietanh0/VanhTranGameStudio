import { resolve } from "node:path";
import type { ServerMessage } from "@studio/shared";
import type { StudioConfig } from "./config.ts";
import { Hub } from "./hub.ts";
import { writeHooksSettings } from "./hooks/settings.ts";
import { logError, logInfo } from "./log.ts";
import { herdrCall, type HerdrCall } from "./herdr/rpc.ts";
import { HerdrSync } from "./herdr/sync.ts";
import { snapshotToDrafts } from "./teams/mapping.ts";
import { MEMBER_SWEEP_MS, MemberTracker } from "./teams/members.ts";
import { SlotStore } from "./teams/slots.ts";
import { TeamRegistry } from "./teams/registry.ts";
import { TerminalBridge } from "./terminal/bridge.ts";
import { QuestionTracker } from "./questions/tracker.ts";
import { readScreenTail } from "./questions/screen.ts";
import { hooksSettingsPath, officeFilePath } from "./paths.ts";
import type { HookEvent } from "@studio/shared";

/** Everything a request handler needs. Built once per process. */
export interface StudioServices {
  config: StudioConfig;
  call: HerdrCall;
  hub: Hub;
  registry: TeamRegistry;
  bridge: TerminalBridge;
  tracker: QuestionTracker;
  members: MemberTracker;
  sync: HerdrSync;
  hooksSettingsFile: string;
  /** Stops the member sweep timer; a no-op until startServices runs. */
  stopSweep: () => void;
}

/** Fans one Claude hook event out to the trackers that care about it. */
export function routeHookEvent(services: StudioServices, event: HookEvent): Promise<void> {
  services.members.onHookEvent(event);
  return services.tracker.onHookEvent(event);
}

/**
 * Wires herdr sync, registry, terminal bridge, question tracker and WS hub together.
 * Nothing connects to herdr until start() is called.
 */
export function createServices(config: StudioConfig, call: HerdrCall = herdrCall): StudioServices {
  const hub = new Hub();
  const registry = new TeamRegistry(new SlotStore(officeFilePath(config.dataDir)));

  const bridge = new TerminalBridge({
    herdrBin: config.herdrBin,
    resolveTerminal: (teamId) => registry.get(teamId)?.terminalId,
    send: (clientIds, message) => hub.send(clientIds, message),
  });

  const tracker = new QuestionTracker({
    emit: (message) => hub.broadcast(message),
    readScreenTail: (paneId) => readScreenTail(call, paneId),
    schedule: (fn, ms) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    },
    isKnownTeam: (teamId) => registry.get(teamId) !== undefined,
  });

  const members = new MemberTracker({
    onChange: (paneId, list) => {
      registry.setMembers(paneId, list);
    },
  });

  registry.subscribe((event) => {
    if (event.type === "team.upsert") {
      hub.broadcast({ type: "team.upsert", team: event.team });
      tracker.onStatus(event.team.id, event.team.status);
      members.onAgentChange(event.team.id, event.team.agent);
      return;
    }
    hub.broadcast({ type: "team.remove", teamId: event.teamId });
    tracker.onTeamRemoved(event.teamId);
    members.onPaneRemoved(event.teamId);
    bridge.endTeam(event.teamId, "team removed");
  });

  let loggedTeamCount = -1;
  const sync = new HerdrSync({
    onSnapshot: (snapshot) => {
      registry.applySnapshot(snapshotToDrafts(snapshot));
      const count = registry.list().length;
      if (count !== loggedTeamCount) {
        loggedTeamCount = count;
        logInfo("herdr", `teams loaded: ${count}`);
      }
    },
    onAgentStatus: (paneId, status) => {
      registry.updateStatus(paneId, status);
    },
    onConnectionChange: (connected) => {
      hub.broadcast({ type: "herdr.status", connected } satisfies ServerMessage);
    },
  });

  return {
    config,
    call,
    hub,
    registry,
    bridge,
    tracker,
    members,
    sync,
    hooksSettingsFile: hooksSettingsPath(config.dataDir),
    stopSweep: () => {},
  };
}

/** Writes the Claude hook settings for this run, then starts the herdr sync loop. */
export function startServices(services: StudioServices): void {
  const { config } = services;
  writeHooksSettings(services.hooksSettingsFile, {
    hookScript: resolve(config.serverRoot, "hook", "post-hook.ts"),
    bunBin: process.execPath,
    port: config.port,
    dataDir: config.dataDir,
  });
  logInfo("hooks", "wrote Claude hook settings", services.hooksSettingsFile);
  const sweep = setInterval(() => services.members.sweep(), MEMBER_SWEEP_MS);
  sweep.unref();
  services.stopSweep = () => clearInterval(sweep);
  services.sync.start();
}

export function stopServices(services: StudioServices): void {
  services.stopSweep();
  try {
    services.sync.stop();
  } catch (err) {
    logError("shutdown", "sync stop failed", err instanceof Error ? err.message : String(err));
  }
  services.bridge.closeAll();
}
