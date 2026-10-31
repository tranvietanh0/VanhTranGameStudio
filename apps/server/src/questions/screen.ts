import type { HerdrCall } from "../herdr/rpc.ts";

export const SCREEN_TAIL_LINES = 12;

/** Last `count` non-empty lines of a screen dump. */
export function tailLines(text: string, count: number = SCREEN_TAIL_LINES): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.slice(-count).join("\n");
}

/** Reads the visible screen of a pane (plain text, no ANSI) and returns its tail. */
export async function readScreenTail(call: HerdrCall, paneId: string): Promise<string> {
  const result = await call<{ read?: { text?: unknown } }>("pane.read", {
    pane_id: paneId,
    source: "visible",
    format: "text",
  });
  const text = result.read?.text;
  if (typeof text !== "string") {
    throw new Error(`pane.read for ${paneId} returned no text`);
  }
  return tailLines(text);
}
