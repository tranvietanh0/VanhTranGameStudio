import type { AgentStatus } from "@studio/shared";
import type { HerdrCall } from "./rpc.ts";
import type { RawSnapshot } from "./snapshot.ts";
import type { HerdrEvent, SubscriptionHandle, SubscriptionSpec } from "./subscription.ts";

export interface SyncHandlers {
  onSnapshot: (snapshot: RawSnapshot) => void;
  onAgentStatus: (paneId: string, status: AgentStatus) => void;
  onConnectionChange: (connected: boolean) => void;
}

export interface SyncOptions {
  call?: HerdrCall;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  debounceMs?: number;
}

export type OpenSub = (
  specs: SubscriptionSpec[],
  onEvent: (e: HerdrEvent) => void,
  onClose: (err: Error) => void,
) => SubscriptionHandle;

export type Timer = ReturnType<typeof setTimeout>;
