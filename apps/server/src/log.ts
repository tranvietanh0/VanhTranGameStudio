/** Minimal timestamped logger. Errors are always printed, never swallowed. */

function stamp(): string {
  return new Date().toISOString();
}

function describe(extra: unknown): string {
  if (extra === undefined) return "";
  if (extra instanceof Error) return ` ${extra.name}: ${extra.message}`;
  if (typeof extra === "string") return ` ${extra}`;
  try {
    return ` ${JSON.stringify(extra)}`;
  } catch {
    return " [unserialisable]";
  }
}

export function logInfo(scope: string, message: string, extra?: unknown): void {
  console.log(`${stamp()} [${scope}] ${message}${describe(extra)}`);
}

export function logWarn(scope: string, message: string, extra?: unknown): void {
  console.warn(`${stamp()} [${scope}] WARN ${message}${describe(extra)}`);
}

export function logError(scope: string, message: string, extra?: unknown): void {
  console.error(`${stamp()} [${scope}] ERROR ${message}${describe(extra)}`);
}
