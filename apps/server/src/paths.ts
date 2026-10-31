import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** apps/server, the directory holding its package.json. */
export const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Monorepo root (two levels above apps/server). */
export const REPO_ROOT = resolve(SERVER_ROOT, "..", "..");

/** STUDIO_DATA_DIR overrides; default is <repo>/data (gitignored). */
export function resolveDataDir(env: Record<string, string | undefined> = process.env): string {
  const override = env.STUDIO_DATA_DIR?.trim();
  return override ? resolve(override) : join(REPO_ROOT, "data");
}

export function tokenFilePath(dataDir: string): string {
  return join(dataDir, "token");
}

export function officeFilePath(dataDir: string): string {
  return join(dataDir, "office.json");
}

export function hooksSettingsPath(dataDir: string): string {
  return join(dataDir, "studio-hooks.json");
}
