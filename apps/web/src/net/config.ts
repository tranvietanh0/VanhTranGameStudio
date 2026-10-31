import { WS_PATH } from "@studio/shared";

const TOKEN_KEY = "studio.token";
const MOCK_MAX_TEAMS = 200;

export interface RuntimeConfig {
  /** Shared secret for the WebSocket. Null when the URL and storage have none. */
  token: string | null;
  /** Number of fake teams when ?mock=N is set, otherwise null (real server). */
  mockTeams: number | null;
  /** Dev-only on-screen stats overlay, enabled by ?stats=1. */
  showStats: boolean;
}

let memoryToken: string | null = null;

/**
 * Reads ?token= once, keeps it in memory, persists it to localStorage and strips it from the
 * address bar so it does not linger in history or screenshots.
 */
function resolveToken(url: URL): string | null {
  const fromUrl = url.searchParams.get("token");
  if (fromUrl) {
    memoryToken = fromUrl;
    try {
      window.localStorage.setItem(TOKEN_KEY, fromUrl);
    } catch (err) {
      console.warn("[config] localStorage unavailable, token kept in memory only", err);
    }
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    return fromUrl;
  }
  if (memoryToken) return memoryToken;
  try {
    memoryToken = window.localStorage.getItem(TOKEN_KEY);
  } catch (err) {
    console.warn("[config] cannot read stored token", err);
  }
  return memoryToken;
}

function parseMockTeams(raw: string | null): number | null {
  if (raw === null) return null;
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1) {
    console.warn(`[config] ignoring ?mock=${raw}: expected a positive integer`);
    return null;
  }
  return Math.min(count, MOCK_MAX_TEAMS);
}

/** Call once at startup, before any WebSocket is opened. */
export function loadRuntimeConfig(): RuntimeConfig {
  const url = new URL(window.location.href);
  const token = resolveToken(url);
  return {
    token,
    mockTeams: parseMockTeams(url.searchParams.get("mock")),
    showStats: url.searchParams.get("stats") === "1",
  };
}

export function buildWsUrl(token: string | null): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const url = new URL(`${scheme}://${window.location.host}${WS_PATH}`);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}
