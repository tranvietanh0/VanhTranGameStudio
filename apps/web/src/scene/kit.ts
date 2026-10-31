import { Box3, BufferGeometry, Color, Float32BufferAttribute, Matrix3, Mesh, Vector3, type Material, type Object3D } from "three";
import { KIT_COLORS, KIT_GLASS, KIT_GLOW, KIT_TINTS } from "./palette";

/** Packed CC0 furniture (see public/assets/CREDITS.md and scripts/build-assets.ts). */
export const KIT_URL = "/assets/office-kit.glb";
/** Kit units → office tiles. Kenney furniture is modelled at roughly 0.7 tiles per desk. */
export const KIT_SCALE = 1.4;

/** A furniture model baked to plain triangles with vertex colours, split by how it is shaded. */
export interface KitTemplate {
  solid: BufferGeometry | null;
  glow: BufferGeometry | null;
  glass: BufferGeometry | null;
  /** Unscaled bounding box size (kit units). */
  size: Vector3;
}

const tmpColor = new Color();
const p = new Vector3();
const nv = new Vector3();
const nmat = new Matrix3();

function baseName(name: string): string {
  return name.replace(/_\d+$/, "");
}

function materialName(m: Material | Material[]): string {
  return Array.isArray(m) ? (m[0]?.name ?? "") : m.name;
}

function materialColor(m: Material | Material[]): Color {
  const mat = (Array.isArray(m) ? m[0] : m) as (Material & { color?: Color }) | undefined;
  return mat?.color ?? tmpColor.set("#ffffff");
}

/** Re-emits one mesh's triangles (world transform applied) with a flat vertex colour. */
function bakeMesh(mesh: Mesh, color: Color, out: { pos: number[]; nrm: number[]; col: number[] }): void {
  const g = mesh.geometry;
  const pa = g.getAttribute("position");
  const na = g.getAttribute("normal");
  if (!pa) return;
  nmat.getNormalMatrix(mesh.matrixWorld);
  const count = g.index ? g.index.count : pa.count;
  for (let k = 0; k < count; k++) {
    const i = g.index ? g.index.getX(k) : k;
    p.fromBufferAttribute(pa, i).applyMatrix4(mesh.matrixWorld);
    if (na) nv.fromBufferAttribute(na, i).applyMatrix3(nmat).normalize();
    else nv.set(0, 1, 0);
    out.pos.push(p.x, p.y, p.z);
    out.nrm.push(nv.x, nv.y, nv.z);
    out.col.push(color.r, color.g, color.b);
  }
}

function toGeometry(src: { pos: number[]; nrm: number[]; col: number[] }): BufferGeometry | null {
  if (src.pos.length === 0) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(src.pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(src.nrm, 3));
  g.setAttribute("color", new Float32BufferAttribute(src.col, 3));
  return g;
}

/**
 * Bakes furniture templates out of the loaded kit scene on demand (cached per model + tint).
 * Every root child of the kit scene is one model, named by its kit key.
 */
export class Kit {
  private readonly models = new Map<string, Object3D>();
  private readonly cache = new Map<string, KitTemplate>();

  constructor(scene: Object3D) {
    scene.updateMatrixWorld(true);
    for (const child of scene.children) this.models.set(baseName(child.name), child);
  }

  has(key: string): boolean {
    return this.models.has(key);
  }

  template(key: string, tint?: string): KitTemplate {
    const cacheKey = `${key}|${tint ?? ""}`;
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;
    const model = this.models.get(key);
    if (!model) throw new Error(`[kit] unknown furniture "${key}"`);
    const overrides = tint ? KIT_TINTS[tint] : undefined;
    if (tint && !overrides) throw new Error(`[kit] unknown tint "${tint}"`);

    const solid = { pos: [] as number[], nrm: [] as number[], col: [] as number[] };
    const glow = { pos: [] as number[], nrm: [] as number[], col: [] as number[] };
    const glass = { pos: [] as number[], nrm: [] as number[], col: [] as number[] };
    model.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const name = materialName(mesh.material);
      const hex = overrides?.[name] ?? KIT_COLORS[name];
      const color = hex ? new Color(hex) : materialColor(mesh.material).clone();
      const target = KIT_GLOW.has(name) ? glow : KIT_GLASS.has(name) ? glass : solid;
      bakeMesh(mesh, color, target);
    });
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    const t: KitTemplate = { solid: toGeometry(solid), glow: toGeometry(glow), glass: toGeometry(glass), size };
    this.cache.set(cacheKey, t);
    return t;
  }

  dispose(): void {
    for (const t of this.cache.values()) {
      t.solid?.dispose();
      t.glow?.dispose();
      t.glass?.dispose();
    }
    this.cache.clear();
  }
}
