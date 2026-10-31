import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** data/office.json: desk slot per herdr pane id. */
export interface OfficeFile {
  version: 1;
  slots: Record<string, number>;
}

const EMPTY: OfficeFile = { version: 1, slots: {} };

/** Parses the office file. A corrupt file is an error: it is never silently reset. */
export function parseOfficeFile(text: string, where: string): OfficeFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`${where} is not valid JSON (${String(err)}); fix or delete it`);
  }
  if (typeof raw !== "object" || raw === null || (raw as { version?: unknown }).version !== 1) {
    throw new Error(`${where} has an unknown format; fix or delete it`);
  }
  const slots = (raw as { slots?: unknown }).slots;
  if (typeof slots !== "object" || slots === null) throw new Error(`${where} has no slots object`);
  const out: Record<string, number> = {};
  for (const [paneId, slot] of Object.entries(slots)) {
    if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0) {
      throw new Error(`${where}: slot for ${paneId} must be a non-negative integer`);
    }
    out[paneId] = slot;
  }
  return { version: 1, slots: out };
}

/** Lowest non-negative integer not in `used`. */
export function lowestFreeSlot(used: ReadonlySet<number>): number {
  let slot = 0;
  while (used.has(slot)) slot++;
  return slot;
}

/**
 * Desk slots keyed by pane id. A slot stays with its pane across restarts; slots of panes
 * that no longer exist are released on prune().
 */
export class SlotStore {
  private slots: Map<string, number>;

  constructor(private readonly file: string) {
    this.slots = new Map(Object.entries(load(file).slots));
  }

  slotOf(paneId: string): number | undefined {
    return this.slots.get(paneId);
  }

  /** Returns the pane's existing slot, or assigns the lowest free one and persists it. */
  assign(paneId: string): number {
    const existing = this.slots.get(paneId);
    if (existing !== undefined) return existing;
    const slot = lowestFreeSlot(new Set(this.slots.values()));
    this.slots.set(paneId, slot);
    this.save();
    return slot;
  }

  /** Drops slots for panes not in `liveIds`. Returns true when anything changed. */
  prune(liveIds: ReadonlySet<string>): boolean {
    let changed = false;
    for (const paneId of [...this.slots.keys()]) {
      if (!liveIds.has(paneId)) {
        this.slots.delete(paneId);
        changed = true;
      }
    }
    if (changed) this.save();
    return changed;
  }

  private save(): void {
    const file: OfficeFile = { version: 1, slots: Object.fromEntries(this.slots) };
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`);
    renameSync(tmp, this.file);
  }
}

function load(file: string): OfficeFile {
  if (!existsSync(file)) return EMPTY;
  return parseOfficeFile(readFileSync(file, "utf8"), file);
}
