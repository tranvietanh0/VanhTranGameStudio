import { connect } from "node:net";
import { HerdrError, isRecord } from "./errors.ts";
import { herdrPipePath } from "./pipe.ts";

export interface RpcOptions {
  timeoutMs?: number;
  pipePath?: string;
}

export type HerdrCall = <T = Record<string, unknown>>(
  method: string,
  params?: Record<string, unknown>,
  options?: RpcOptions,
) => Promise<T>;

const DEFAULT_TIMEOUT_MS = 5000;
let requestCounter = 0;

/**
 * One request per connection: herdr never answers a second request on the same socket.
 * Resolves with the `result` object; rejects with HerdrError on transport, timeout or herdr error.
 */
export function herdrCall<T = Record<string, unknown>>(
  method: string,
  params: Record<string, unknown> = {},
  options: RpcOptions = {},
): Promise<T> {
  const pipe = options.pipePath ?? herdrPipePath();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const id = String(++requestCounter);

  return new Promise<T>((resolve, reject) => {
    const socket = connect(pipe);
    let buffer = "";
    let settled = false;

    const finish = (err: Error | null, value?: T): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(value as T);
    };

    const timer = setTimeout(() => {
      finish(new HerdrError("timeout", `herdr ${method} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ id, method, params })}\n`);
    });
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const [err, result] = parseReply(method, buffer.slice(0, newline));
      finish(err, result as T);
    });
    socket.on("error", (err: Error) => {
      finish(new HerdrError("transport", `herdr ${method} socket error: ${err.message}`));
    });
    socket.on("close", () => {
      finish(new HerdrError("transport", `herdr ${method} connection closed before a reply`));
    });
  });
}

/** Parses one reply line into [error, result]. Exported for unit tests. */
export function parseReply(method: string, line: string): [Error | null, unknown?] {
  let reply: unknown;
  try {
    reply = JSON.parse(line);
  } catch (err) {
    return [new HerdrError("protocol", `herdr ${method} sent invalid JSON: ${String(err)}`)];
  }
  if (!isRecord(reply)) {
    return [new HerdrError("protocol", `herdr ${method} reply is not an object`)];
  }
  if (isRecord(reply.error)) {
    const code = typeof reply.error.code === "string" ? reply.error.code : "unknown";
    const message = typeof reply.error.message === "string" ? reply.error.message : "no message";
    return [new HerdrError(code, `herdr ${method} failed: ${message}`)];
  }
  if (!("result" in reply)) {
    return [new HerdrError("protocol", `herdr ${method} reply has neither result nor error`)];
  }
  return [null, reply.result];
}
