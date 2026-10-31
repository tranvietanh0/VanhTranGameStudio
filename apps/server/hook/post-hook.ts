// Claude Code hook: forwards one hook event to the studio server. Runs inside a herdr pane.
// Usage (written by src/hooks/settings.ts): bun post-hook.ts <EventName> --port N --data <dir>
// Must never block Claude: always exits 0, and gives up after 2 seconds.
import { existsSync, readFileSync } from "node:fs";
import { HOOK_PATH, type HookEvent } from "@studio/shared";
import { resolveDataDir, tokenFilePath } from "../src/paths.ts";

const TIMEOUT_MS = 2000;

interface HookArgs {
  event: string;
  port: number;
  dataDir: string;
}

function parseArgs(argv: string[]): HookArgs {
  const [event = "", ...rest] = argv;
  const flag = (name: string): string | undefined => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const port = Number(flag("--port") ?? "7420");
  const dataDir = flag("--data") ?? resolveDataDir();
  return { event, port, dataDir };
}

function readToken(dataDir: string): string {
  const file = tokenFilePath(dataDir);
  if (!existsSync(file)) throw new Error(`token file missing at ${file}`);
  return readFileSync(file, "utf8").trim();
}

function parsePayload(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // fall through: keep the raw text so the server can log it
  }
  return { raw: text.slice(0, 4000) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const paneId = process.env.HERDR_PANE_ID?.trim();
  // Outside a herdr pane there is no team to report for; nothing to do.
  if (!paneId || !args.event) return;

  // Bun.stdin.text() never settles for a piped stdin on Windows; the Response form does.
  const payload = parsePayload(await new Response(Bun.stdin.stream()).text());
  const token = readToken(args.dataDir);
  const body: HookEvent = { paneId, event: args.event as HookEvent["event"], payload };

  const response = await fetch(`http://127.0.0.1:${args.port}${HOOK_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-studio-token": token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) console.error(`studio hook: server answered ${response.status}`);
}

main()
  .catch((err: unknown) => {
    console.error(`studio hook: ${err instanceof Error ? err.message : String(err)}`);
  })
  .finally(() => {
    // Never a non-zero exit: a failing studio hook must not block or fail Claude.
    process.exitCode = 0;
  });
