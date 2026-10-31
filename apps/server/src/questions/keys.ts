import type { TerminalKey } from "@studio/shared";

/** Terminal byte sequences for named keys. Digits and y/n are sent as their literal character. */
const SEQUENCES: Readonly<Record<string, string>> = {
  Enter: "\r",
  Escape: "\x1b",
  Up: "\x1b[A",
  Down: "\x1b[B",
  Right: "\x1b[C",
  Left: "\x1b[D",
  Tab: "\t",
};

const LITERAL_KEYS: ReadonlySet<string> = new Set(["y", "n", "1", "2", "3", "4"]);

export const TERMINAL_KEYS: readonly TerminalKey[] = [
  "Enter", "Escape", "Up", "Down", "Left", "Right", "Tab", "y", "n", "1", "2", "3", "4",
];

export function isTerminalKey(value: unknown): value is TerminalKey {
  return typeof value === "string" && (TERMINAL_KEYS as readonly string[]).includes(value);
}

/** Maps one key name to the bytes written to the terminal. Throws on an unknown name. */
export function keyToBytes(key: TerminalKey): string {
  const sequence = SEQUENCES[key];
  if (sequence !== undefined) return sequence;
  if (LITERAL_KEYS.has(key)) return key;
  throw new Error(`unknown terminal key "${String(key)}"`);
}
