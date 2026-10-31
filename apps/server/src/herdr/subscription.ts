import { connect, type Socket } from "node:net";
import { HerdrError, isRecord } from "./errors.ts";
import { herdrPipePath } from "./pipe.ts";

/** One entry of events.subscribe. pane.agent_status_changed requires pane_id. */
export interface SubscriptionSpec {
  type: string;
  pane_id?: string;
}

export interface HerdrEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface SubscriptionHandlers {
  onEvent: (event: HerdrEvent) => void;
  /** Called once when the connection ends by itself (herdr gone, socket error). Not called after close(). */
  onClose: (error: Error) => void;
}

export interface SubscriptionHandle {
  close: () => void;
}

/**
 * Opens a long-lived events.subscribe connection. Subscriptions are fixed for the
 * connection's lifetime, so a change of pane set means opening a new one (see sync.ts).
 */
export function openSubscription(
  specs: SubscriptionSpec[],
  handlers: SubscriptionHandlers,
  pipePath: string = herdrPipePath(),
): SubscriptionHandle {
  let closedByUs = false;
  let acknowledged = false;
  let buffer = "";
  const socket: Socket = connect(pipePath);

  const fail = (error: Error): void => {
    if (closedByUs) return;
    closedByUs = true;
    socket.destroy();
    handlers.onClose(error);
  };

  socket.on("connect", () => {
    socket.write(`${JSON.stringify({ id: "sub", method: "events.subscribe", params: { subscriptions: specs } })}\n`);
  });

  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim() !== "") {
        const error = handleLine(line, acknowledged);
        if (error) return fail(error);
        acknowledged = true;
        const message = parseLine(line);
        if (message && isEvent(message)) handlers.onEvent(message);
      }
      newline = buffer.indexOf("\n");
    }
  });

  socket.on("error", (err: Error) => {
    fail(new HerdrError("transport", `herdr subscription socket error: ${err.message}`));
  });
  socket.on("close", () => {
    fail(new HerdrError("transport", "herdr subscription connection closed"));
  });

  return {
    close: () => {
      if (closedByUs) return;
      closedByUs = true;
      socket.destroy();
    },
  };
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/** The first line must be the subscription ack; a herdr error reply there is fatal. */
function handleLine(line: string, acknowledged: boolean): Error | null {
  const message = parseLine(line);
  if (!isRecord(message)) {
    return new HerdrError("protocol", `herdr subscription sent a non-JSON line: ${line.slice(0, 120)}`);
  }
  if (!acknowledged && isRecord(message.error)) {
    const text = typeof message.error.message === "string" ? message.error.message : "unknown";
    return new HerdrError("subscribe", `herdr rejected events.subscribe: ${text}`);
  }
  return null;
}

function isEvent(value: unknown): value is HerdrEvent {
  return isRecord(value) && typeof value.event === "string" && isRecord(value.data);
}
