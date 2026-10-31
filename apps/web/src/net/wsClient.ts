import type { ClientMessage, ServerMessage } from "@studio/shared";
import type { Transport } from "./transport";

export type WsStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface WsClientOptions {
  /** Called on every (re)connect so token changes apply without a restart. */
  url: () => string;
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: WsStatus, attempt: number) => void;
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;

/** Exponential backoff with jitter in [50%, 100%] of the capped delay. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const capped = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.round(capped * (0.5 + random() * 0.5));
}

function isServerMessage(value: unknown): value is ServerMessage {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

export class WsClient implements Transport {
  readonly name = "ws" as const;
  private socket: WebSocket | null = null;
  private attempt = 0;
  private timer: number | null = null;
  private stopped = true;

  constructor(private readonly opts: WsClientOptions) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, "client stop");
    this.opts.onStatus("closed", this.attempt);
  }

  send(msg: ClientMessage): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(msg));
    return true;
  }

  private open(): void {
    this.opts.onStatus(this.attempt === 0 ? "connecting" : "reconnecting", this.attempt);
    const socket = new WebSocket(this.opts.url());
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      this.opts.onStatus("open", 0);
    };
    socket.onmessage = (event: MessageEvent<unknown>) => this.handleRaw(event.data);
    socket.onclose = (event: CloseEvent) => {
      if (this.socket === socket) this.socket = null;
      if (this.stopped) return;
      this.scheduleReconnect(event.reason);
    };
  }

  private handleRaw(raw: unknown): void {
    if (typeof raw !== "string") {
      console.warn("[ws] ignoring non-text frame");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn("[ws] ignoring malformed JSON frame", err);
      return;
    }
    if (!isServerMessage(parsed)) {
      console.warn("[ws] ignoring frame without a message type");
      return;
    }
    this.opts.onMessage(parsed);
  }

  private scheduleReconnect(reason: string): void {
    const delay = backoffDelay(this.attempt);
    this.attempt += 1;
    console.info(`[ws] closed (${reason || "no reason"}), retrying in ${delay}ms`);
    this.opts.onStatus("reconnecting", this.attempt);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.open();
    }, delay);
  }
}
