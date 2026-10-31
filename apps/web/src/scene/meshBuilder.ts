import { BufferGeometry, Color, Float32BufferAttribute, Matrix3, Matrix4, Vector3 } from "three";

const v = new Vector3();
const n = new Vector3();
const nm = new Matrix3();
const c = new Color();

/**
 * Accumulates non-indexed triangles (position, normal, vertex colour) from many sources into one
 * geometry, so the whole static office is a single draw call per material.
 */
export class MeshBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Appends a baked template (non-indexed, with position/normal/color) transformed by `m`. */
  addGeometry(g: BufferGeometry, m: Matrix4): void {
    const p = g.getAttribute("position");
    const no = g.getAttribute("normal");
    const co = g.getAttribute("color");
    if (!p || !no || !co || g.index) throw new Error("[meshBuilder] template must be non-indexed with normal + color");
    nm.getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      n.fromBufferAttribute(no, i).applyMatrix3(nm).normalize();
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(n.x, n.y, n.z);
      this.col.push(co.getX(i), co.getY(i), co.getZ(i));
    }
  }

  /** Quad from four corners in counter-clockwise order (seen from the front). Colours per corner. */
  addQuad(a: Vector3, b: Vector3, cc: Vector3, d: Vector3, colors: readonly [string, string, string, string] | string): void {
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(d, a)).normalize();
    const cols = typeof colors === "string" ? [colors, colors, colors, colors] : colors;
    const corners = [a, b, cc, d];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = corners[i]!;
      c.set(cols[i]!);
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(normal.x, normal.y, normal.z);
      this.col.push(c.r, c.g, c.b);
    }
  }

  /** Axis-aligned box between two corners. `top` optionally colours the upward face differently. */
  addBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, opts: { top?: string; bottom?: boolean } = {}): void {
    const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const top = opts.top ?? color;
    this.addQuad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), top);
    this.addQuad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), color);
    this.addQuad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), color);
    this.addQuad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), color);
    this.addQuad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), color);
    if (opts.bottom) this.addQuad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), color);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("color", new Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
