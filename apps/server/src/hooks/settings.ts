import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "SubagentStart",
  "SubagentStop",
] as const;
export type HookEventName = (typeof HOOK_EVENTS)[number];

export interface HooksSettingsOptions {
  /** Absolute path to apps/server/hook/post-hook.ts. */
  hookScript: string;
  /** Absolute path to the bun binary that runs the hook. */
  bunBin: string;
  port: number;
  dataDir: string;
}

/** Forward slashes keep the command valid in both bash and cmd on Windows. */
function slashes(path: string): string {
  return path.replace(/\\/g, "/");
}

export function hookCommand(event: HookEventName, opts: HooksSettingsOptions): string {
  return [
    `"${slashes(opts.bunBin)}"`,
    `"${slashes(opts.hookScript)}"`,
    event,
    "--port",
    String(opts.port),
    "--data",
    `"${slashes(opts.dataDir)}"`,
  ].join(" ");
}

/** The settings object passed to `claude --settings`. Only studio hooks; nothing from ~/.claude. */
export function buildHooksSettings(opts: HooksSettingsOptions): Record<string, unknown> {
  const entry = (event: HookEventName, matcher?: string) => ({
    ...(matcher ? { matcher } : {}),
    hooks: [{ type: "command", command: hookCommand(event, opts) }],
  });
  return {
    hooks: {
      PreToolUse: [entry("PreToolUse", "AskUserQuestion"), entry("PreToolUse", "Agent|Task")],
      PostToolUse: [entry("PostToolUse", "AskUserQuestion")],
      Notification: [entry("Notification")],
      Stop: [entry("Stop")],
      SubagentStart: [entry("SubagentStart")],
      SubagentStop: [entry("SubagentStop")],
    },
  };
}

export function writeHooksSettings(file: string, opts: HooksSettingsOptions): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(buildHooksSettings(opts), null, 2)}\n`);
}
