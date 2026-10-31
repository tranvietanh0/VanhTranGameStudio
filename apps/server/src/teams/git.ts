import { resolve } from "node:path";

/** Normalised git toplevel of `path`, or null when it is not inside a repository. */
export async function gitToplevel(path: string): Promise<string | null> {
  const proc = Bun.spawn(["git", "-C", path, "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (code !== 0) return null;
  const top = stdout.trim();
  if (top === "") return null;
  return normalisePath(top);
}

/** Case-insensitive, separator-normalised form for comparing Windows paths. */
export function normalisePath(path: string): string {
  return resolve(path).replace(/\\/g, "/").toLowerCase();
}
