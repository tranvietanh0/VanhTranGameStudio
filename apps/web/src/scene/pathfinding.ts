/**
 * Coarse walk grid and A* search for the CEO avatar. Pure TS, no three.js, unit-tested.
 * Tiles are integer cells; tile (x, z) covers world [x, x+1) x [z, z+1).
 */

export interface Tile {
  x: number;
  z: number;
}

export interface Grid {
  width: number;
  depth: number;
  /** 1 = obstacle, row-major by z then x. */
  blocked: Uint8Array;
}

export function createGrid(width: number, depth: number): Grid {
  if (!Number.isInteger(width) || !Number.isInteger(depth) || width < 1 || depth < 1) {
    throw new Error(`createGrid: invalid size ${width}x${depth}`);
  }
  return { width, depth, blocked: new Uint8Array(width * depth) };
}

export function inBounds(grid: Grid, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < grid.width && z < grid.depth;
}

/** Out-of-bounds counts as blocked, so the office edge is a wall. */
export function isBlocked(grid: Grid, x: number, z: number): boolean {
  if (!inBounds(grid, x, z)) return true;
  return grid.blocked[z * grid.width + x] === 1;
}

export function setBlocked(grid: Grid, x: number, z: number, blocked = true): void {
  if (!inBounds(grid, x, z)) return;
  grid.blocked[z * grid.width + x] = blocked ? 1 : 0;
}

/** Marks a w x d block of tiles starting at (x, z). */
export function blockRect(grid: Grid, x: number, z: number, w: number, d: number): void {
  for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) setBlocked(grid, x + dx, z + dz);
}

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

function octile(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

/** Minimal binary min-heap of node indices keyed by an external score array. */
class IndexHeap {
  private items: number[] = [];
  constructor(private readonly score: Float32Array) {}
  get size(): number {
    return this.items.length;
  }
  push(index: number): void {
    const items = this.items;
    items.push(index);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.key(parent) <= this.key(i)) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const items = this.items;
    const top = items[0] as number;
    const last = items.pop() as number;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.key(l) < this.key(m)) m = l;
        if (r < items.length && this.key(r) < this.key(m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private key(i: number): number {
    return this.score[this.items[i] as number] as number;
  }
  private swap(a: number, b: number): void {
    const items = this.items;
    const t = items[a] as number;
    items[a] = items[b] as number;
    items[b] = t;
  }
}

/**
 * 8-directional A* without corner cutting. Returns tiles from start to goal inclusive, or null
 * when the goal is blocked, out of bounds, or unreachable. The start tile itself may be blocked
 * (the avatar can stand at an obstacle edge); it is only left, never entered.
 */
export function findPath(grid: Grid, start: Tile, goal: Tile): Tile[] | null {
  if (!inBounds(grid, start.x, start.z) || isBlocked(grid, goal.x, goal.z)) return null;
  if (start.x === goal.x && start.z === goal.z) return [{ x: start.x, z: start.z }];

  const w = grid.width;
  const total = w * grid.depth;
  const g = new Float32Array(total).fill(Number.POSITIVE_INFINITY);
  const f = new Float32Array(total).fill(Number.POSITIVE_INFINITY);
  const from = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const open = new IndexHeap(f);

  const startIdx = start.z * w + start.x;
  const goalIdx = goal.z * w + goal.x;
  g[startIdx] = 0;
  f[startIdx] = octile(start.x, start.z, goal.x, goal.z);
  open.push(startIdx);

  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goalIdx) return rebuild(from, cur, w);
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cz = (cur - cx) / w;
    for (const [dx, dz, cost] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (isBlocked(grid, nx, nz)) continue;
      if (dx !== 0 && dz !== 0 && (isBlocked(grid, cx + dx, cz) || isBlocked(grid, cx, cz + dz))) continue;
      const ni = nz * w + nx;
      if (closed[ni]) continue;
      const tentative = (g[cur] as number) + cost;
      if (tentative >= (g[ni] as number)) continue;
      g[ni] = tentative;
      f[ni] = tentative + octile(nx, nz, goal.x, goal.z);
      from[ni] = cur;
      open.push(ni);
    }
  }
  return null;
}

function rebuild(from: Int32Array, end: number, w: number): Tile[] {
  const path: Tile[] = [];
  for (let i = end; i !== -1; i = from[i] as number) {
    const x = i % w;
    path.push({ x, z: (i - x) / w });
  }
  return path.reverse();
}
