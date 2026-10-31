import { statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { Server } from "bun";
import { HOOK_PATH, WS_PATH, type HookEvent } from "@studio/shared";
import { isLoopback, tokenMatches } from "./auth.ts";
import type { ClientData } from "./hub.ts";
import { logError, logWarn } from "./log.ts";

export interface HttpOptions {
  token: string;
  /** Built web app (apps/web/dist). Missing directory means "not built" and the server says so. */
  webDist: string;
  onHook: (event: HookEvent) => Promise<void> | void;
}

const HOOK_EVENT_NAMES: ReadonlySet<string> = new Set([
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "SubagentStart",
  "SubagentStop",
]);

export const TOKEN_HEADER = "x-studio-token";

type FetchHandler = (req: Request, server: Server<ClientData>) => Promise<Response | undefined>;

export function createHttpHandler(options: HttpOptions): FetchHandler {
  return async (req, server) => {
    const url = new URL(req.url);
    if (url.pathname === WS_PATH) return upgradeWebSocket(req, url, server, options.token);
    if (url.pathname === HOOK_PATH) return handleHook(req, server, options);
    if (req.method !== "GET" && req.method !== "HEAD") return text(405, "method not allowed");
    return serveStatic(url.pathname, options.webDist);
  };
}

function text(status: number, message: string): Response {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function upgradeWebSocket(req: Request, url: URL, server: Server<ClientData>, token: string): Response | undefined {
  if (!tokenMatches(url.searchParams.get("token"), token)) {
    logWarn("auth", "WS upgrade refused: bad or missing token");
    return text(401, "unauthorized");
  }
  const upgraded = server.upgrade(req, { data: { clientId: crypto.randomUUID() } });
  return upgraded ? undefined : text(400, "websocket upgrade failed");
}

async function handleHook(req: Request, server: Server<ClientData>, options: HttpOptions): Promise<Response> {
  if (req.method !== "POST") return text(405, "method not allowed");
  if (!tokenMatches(req.headers.get(TOKEN_HEADER), options.token)) {
    logWarn("auth", "hook refused: bad or missing token");
    return text(401, "unauthorized");
  }
  const address = server.requestIP(req)?.address;
  if (!isLoopback(address)) {
    logWarn("auth", "hook refused: not a loopback caller", address ?? "unknown");
    return text(403, "forbidden");
  }
  const event = await readHookEvent(req);
  if (!event) return text(400, "invalid hook event");
  try {
    await options.onHook(event);
    return new Response(null, { status: 204 });
  } catch (err) {
    logError("hook", `handling ${event.event} failed`, err instanceof Error ? err.message : String(err));
    return text(500, "hook handling failed");
  }
}

/** Validates the hook body at the boundary. Returns null when it does not match HookEvent. */
export async function readHookEvent(req: Request): Promise<HookEvent | null> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const { paneId, event, payload } = body;
  if (typeof paneId !== "string" || paneId === "") return null;
  if (typeof event !== "string" || !HOOK_EVENT_NAMES.has(event)) return null;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  return { paneId, event: event as HookEvent["event"], payload: payload as Record<string, unknown> };
}

function serveStatic(pathname: string, webDist: string): Response {
  if (!isDirectory(webDist)) {
    return text(404, "Studio web app is not built. Run the web dev server (apps/web) or build it first.");
  }
  const root = resolve(webDist);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return text(400, "bad path");
  }
  const relative = decoded === "/" ? "/index.html" : decoded;
  const candidate = resolve(root, `.${relative}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) return text(403, "forbidden");

  if (isFile(candidate)) return new Response(Bun.file(candidate));
  // Client-side routes have no extension: serve the SPA shell.
  const index = join(root, "index.html");
  if (extname(relative) === "" && isFile(index)) return new Response(Bun.file(index));
  return text(404, "not found");
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
