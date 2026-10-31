import type { ClientMessage } from "@studio/shared";
import { sendClient } from "./transport";

type RequestMessage = Extract<ClientMessage, { requestId: string }>;

interface Pending {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 10_000;
const pending = new Map<string, Pending>();
let requestSeq = 0;

/** crypto.randomUUID is absent outside secure contexts, and the office is served over plain http on Tailscale. */
export function newRequestId(): string {
  requestSeq += 1;
  return `req-${Date.now().toString(36)}-${requestSeq.toString(36)}`;
}

function settle(requestId: string, error?: Error): boolean {
  const entry = pending.get(requestId);
  if (!entry) return false;
  pending.delete(requestId);
  clearTimeout(entry.timer);
  if (error) entry.reject(error);
  else entry.resolve();
  return true;
}

/** Sends a request-carrying message and resolves on the matching ack, rejects on error or timeout. */
export function sendRequest(msg: RequestMessage): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => settle(msg.requestId, new Error("Server không phản hồi")), REQUEST_TIMEOUT_MS);
    pending.set(msg.requestId, { resolve, reject, timer });
    if (!sendClient(msg)) settle(msg.requestId, new Error("Chưa kết nối tới server"));
  });
}

export function ackRequest(requestId: string): boolean {
  return settle(requestId);
}

export function failRequest(requestId: string, message: string): boolean {
  return settle(requestId, new Error(message));
}
