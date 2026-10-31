import type { Subprocess } from "bun";
import { logWarn } from "../log.ts";
import { isRecord } from "../herdr/errors.ts";

export interface ControlHandlers {
  /** `bytes` is base64 terminal output, forwarded to the browser as-is. */
  onFrame: (bytes: string, full: boolean) => void;
  onExit: (reason: string) => void;
}

/** One `herdr terminal session control <terminal>` child. NDJSON on stdio. */
export interface ControlProcess {
  sendInput: (bytesBase64: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
}

export function encodeInput(bytesBase64: string): string {
  return JSON.stringify({ type: "terminal.input", bytes: bytesBase64, encoding: "base64" });
}

/** Keystroke bytes as UTF-8 base64, for the control stream. */
export function textToInputLine(text: string): string {
  return encodeInput(Buffer.from(text, "utf8").toString("base64"));
}

export function spawnControl(
  herdrBin: string,
  terminalId: string,
  cols: number,
  rows: number,
  handlers: ControlHandlers,
): ControlProcess {
  const proc: Subprocess<"pipe", "pipe", "pipe"> = Bun.spawn(
    [herdrBin, "terminal", "session", "control", terminalId, "--cols", String(cols), "--rows", String(rows)],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );

  void readStdout(proc, handlers);
  void readStderr(proc, terminalId);
  void proc.exited.then((code) => {
    handlers.onExit(`herdr control exited with code ${code}`);
  });

  const write = (line: string): void => {
    proc.stdin.write(`${line}\n`);
    proc.stdin.flush();
  };

  return {
    sendInput: (bytesBase64) => write(encodeInput(bytesBase64)),
    resize: (c, r) => write(JSON.stringify({ type: "terminal.resize", cols: c, rows: r })),
    kill: () => proc.kill(),
  };
}

async function readStdout(proc: Subprocess<"pipe", "pipe", "pipe">, handlers: ControlHandlers): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of proc.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) handleLine(line, handlers);
      newline = buffer.indexOf("\n");
    }
  }
}

function handleLine(line: string, handlers: ControlHandlers): void {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    logWarn("terminal", "non-JSON line from herdr control", line.slice(0, 120));
    return;
  }
  if (!isRecord(message) || typeof message.bytes !== "string") return;
  handlers.onFrame(message.bytes, message.full === true);
}

async function readStderr(proc: Subprocess<"pipe", "pipe", "pipe">, terminalId: string): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of proc.stderr) {
    const text = decoder.decode(chunk).trim();
    if (text) logWarn("terminal", `herdr control stderr for ${terminalId}`, text.slice(0, 500));
  }
}
