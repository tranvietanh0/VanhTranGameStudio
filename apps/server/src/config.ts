import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { DEFAULT_PORT } from "@studio/shared";
import { REPO_ROOT, SERVER_ROOT, resolveDataDir, tokenFilePath } from "./paths.ts";

export interface StudioConfig {
  bind: string;
  port: number;
  token: string;
  repoRoot: string;
  serverRoot: string;
  dataDir: string;
  webDist: string;
  herdrBin: string;
}

type Env = Record<string, string | undefined>;

export function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`STUDIO_PORT must be an integer 1-65535, got "${raw}"`);
  }
  return n;
}

/**
 * Token precedence: STUDIO_TOKEN env, then data/token file, else generate once and persist.
 * A token file that exists but is too short is an error, not silently replaced.
 */
export function loadToken(dataDir: string, env: Env): string {
  const fromEnv = env.STUDIO_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const file = tokenFilePath(dataDir);
  if (existsSync(file)) {
    const token = readFileSync(file, "utf8").trim();
    if (token.length < 16) {
      throw new Error(`token file ${file} is too short; delete it to regenerate`);
    }
    return token;
  }
  mkdirSync(dataDir, { recursive: true });
  const token = randomBytes(32).toString("base64url");
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  return token;
}

export function loadConfig(env: Env = process.env): StudioConfig {
  const dataDir = resolveDataDir(env);
  mkdirSync(dataDir, { recursive: true });
  return {
    bind: env.STUDIO_BIND?.trim() || "127.0.0.1",
    port: parsePort(env.STUDIO_PORT),
    token: loadToken(dataDir, env),
    repoRoot: REPO_ROOT,
    serverRoot: SERVER_ROOT,
    dataDir,
    webDist: join(REPO_ROOT, "apps", "web", "dist"),
    herdrBin: env.HERDR_BIN?.trim() || "herdr",
  };
}
