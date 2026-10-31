import { join } from "node:path";

const BACKSLASH = String.fromCharCode(92);

/**
 * herdr listens on a Windows named pipe: \\.\pipe\<abs path of herdr.sock>.
 * HERDR_SOCKET overrides the default %APPDATA%\herdr\herdr.sock.
 */
export function herdrPipePath(env: Record<string, string | undefined> = process.env): string {
  const override = env.HERDR_SOCKET?.trim();
  const sockPath = override || join(requireEnv(env, "APPDATA"), "herdr", "herdr.sock");
  return `${BACKSLASH.repeat(2)}.${BACKSLASH}pipe${BACKSLASH}${sockPath}`;
}

function requireEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is not set; cannot locate the herdr socket`);
  return value;
}
