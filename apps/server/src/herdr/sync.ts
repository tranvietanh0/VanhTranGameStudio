import { logError, logInfo, logWarn } from "../log.ts";
import { parseSnapshot, type RawSnapshot } from "./snapshot.ts";
import { herdrCall, type HerdrCall } from "./rpc.ts";
import { resubscribe } from "./resubscribe.ts";
import { openSubscription, type HerdrEvent, type SubscriptionHandle } from "./subscription.ts";
import type { OpenSub, SyncHandlers, SyncOptions, Timer } from "./sync-types.ts";
import { buildSubscriptions, paneIds, parseStatusEvent, sameIds, type StatusChange } from "./subscriptions.ts";

export type { SyncHandlers, SyncOptions } from "./sync-types.ts";

/**
 * Mirrors herdr into memory. herdr is the source of truth: every (re)connect re-reads
 * session.snapshot, and the pane set decides whether the event subscription is replaced.
 */
export class HerdrSync {
  private readonly call: HerdrCall;
  private readonly openSub: OpenSub;
  private readonly minBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly debounceMs: number;
  private backoffMs: number;
  private running = false;
  private connected = false;
  private busy = false;
  private queued = false;
  private current: SubscriptionHandle | null = null;
  private subscribedIds: string[] = [];
  private lastFailure: string | null = null;
  private retryTimer: Timer | null = null;
  private debounceTimer: Timer | null = null;

  constructor(private readonly handlers: SyncHandlers, options: SyncOptions = {}) {
    this.call = options.call ?? ((method, params, opts) => herdrCall(method, params, opts));
    this.openSub = (specs, onEvent, onClose) => openSubscription(specs, { onEvent, onClose });
    this.minBackoffMs = options.minBackoffMs ?? 500;
    this.maxBackoffMs = options.maxBackoffMs ?? 10_000;
    this.debounceMs = options.debounceMs ?? 150;
    this.backoffMs = this.minBackoffMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.run();
  }

  stop(): void {
    this.running = false;
    this.clearTimers();
    this.current?.close();
    this.current = null;
    this.subscribedIds = [];
    this.setConnected(false);
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** Coalesced, debounced re-read of the snapshot (events arrive in bursts). */
  private requestSync(): void {
    if (!this.running || this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.run();
    }, this.debounceMs);
  }

  /** Serialises syncs: at most one runs, and one more is queued if requested meanwhile. */
  private run(): void {
    this.queued = true;
    if (this.busy) return;
    this.busy = true;
    void (async () => {
      while (this.running && this.queued) {
        this.queued = false;
        try {
          await this.sync();
          this.onSyncOk();
        } catch (err) {
          this.onSyncFailed(err);
        }
      }
      this.busy = false;
    })();
  }

  private async sync(): Promise<void> {
    const snapshot = await this.readSnapshot();
    const ids = paneIds(snapshot);
    if (!this.current || !sameIds(ids, this.subscribedIds)) {
      const fresh = await this.resubscribe(ids);
      this.handlers.onSnapshot(fresh);
      return;
    }
    this.handlers.onSnapshot(snapshot);
  }

  /** Swaps in a subscription matching the current pane set; the old one is closed after the swap. */
  private async resubscribe(initialIds: string[]): Promise<RawSnapshot> {
    const result = await resubscribe(
      initialIds,
      () => this.readSnapshot(),
      (ids) => this.openSubscriptionFor(ids),
    );
    const previous = this.current;
    this.current = result.handle;
    this.subscribedIds = result.ids;
    previous?.close();
    return result.snapshot;
  }

  private openSubscriptionFor(ids: string[]): SubscriptionHandle {
    const handle: SubscriptionHandle = this.openSub(
      buildSubscriptions(ids),
      (event) => this.onEvent(handle, event),
      (err) => this.onSubscriptionLost(handle, err),
    );
    return handle;
  }

  private async readSnapshot(): Promise<RawSnapshot> {
    const result = await this.call<unknown>("session.snapshot", {});
    return parseSnapshot(result);
  }

  private onEvent(handle: SubscriptionHandle, event: HerdrEvent): void {
    if (handle !== this.current) return;
    if (event.event === "pane_agent_status_changed" && this.applyStatusEvent(event.data)) return;
    this.requestSync();
  }

  /** Applies a status change directly when it names a subscribed pane. Returns false to fall back to a resync. */
  private applyStatusEvent(data: Record<string, unknown>): boolean {
    let change: StatusChange | null;
    try {
      change = parseStatusEvent(data);
    } catch (err) {
      logWarn("herdr", "status event could not be parsed; resyncing", err instanceof Error ? err.message : String(err));
      return false;
    }
    if (!change || !this.subscribedIds.includes(change.paneId)) return false;
    this.handlers.onAgentStatus(change.paneId, change.status);
    return true;
  }

  private onSubscriptionLost(handle: SubscriptionHandle, err: Error): void {
    if (handle !== this.current) return;
    this.current = null;
    this.subscribedIds = [];
    logWarn("herdr", "event subscription lost", err.message);
    this.setConnected(false);
    this.scheduleRetry();
  }

  private onSyncOk(): void {
    this.lastFailure = null;
    this.backoffMs = this.minBackoffMs;
    this.setConnected(true);
  }

  private onSyncFailed(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    if (message !== this.lastFailure) logError("herdr", "sync failed; will retry", message);
    this.lastFailure = message;
    this.setConnected(false);
    this.current?.close();
    this.current = null;
    this.subscribedIds = [];
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (!this.running || this.retryTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.run();
    }, delay);
  }

  private setConnected(value: boolean): void {
    if (this.connected === value) return;
    this.connected = value;
    logInfo("herdr", value ? "connected" : "disconnected");
    this.handlers.onConnectionChange(value);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.retryTimer = null;
    this.debounceTimer = null;
  }
}

