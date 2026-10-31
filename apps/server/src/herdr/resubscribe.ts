import { HerdrError } from "./errors.ts";
import type { SubscriptionHandle } from "./subscription.ts";
import type { RawSnapshot } from "./snapshot.ts";
import { paneIds, sameIds } from "./subscriptions.ts";

export interface Resubscribed {
  snapshot: RawSnapshot;
  handle: SubscriptionHandle;
  /** Pane ids the returned handle is subscribed to. */
  ids: string[];
}

/**
 * Opens a subscription for `initialIds`, re-reads the snapshot, and accepts the handle only if the
 * pane set still matches. Events between the first read and the open would otherwise be missed,
 * so a mismatch retries with the new pane set. The losing handle is always closed.
 */
export async function resubscribe(
  initialIds: string[],
  readSnapshot: () => Promise<RawSnapshot>,
  open: (ids: string[]) => SubscriptionHandle,
  maxAttempts = 3,
): Promise<Resubscribed> {
  let wanted = initialIds;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const handle = open(wanted);
    try {
      const snapshot = await readSnapshot();
      const actual = paneIds(snapshot);
      if (sameIds(actual, wanted)) return { snapshot, handle, ids: wanted };
      handle.close();
      wanted = actual;
    } catch (err) {
      handle.close();
      throw err;
    }
  }
  throw new HerdrError("resync", `pane set kept changing across ${maxAttempts} resubscribe attempts`);
}
