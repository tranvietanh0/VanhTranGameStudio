import { InstancedMesh, MeshBasicMaterial, PlaneGeometry, type DataTexture, type Group, type MeshStandardMaterial } from "three";
import { getShadowTexture } from "../shadowTexture";
import { createCharacterMaterial, createJointTexture, type CharacterLibrary } from "./rig";

const MIN_CAPACITY = 8;

function grow(capacity: number, need: number): number {
  let c = Math.max(MIN_CAPACITY, capacity);
  while (c < need) c *= 2;
  return c;
}

/** All characters of one variant: one instanced mesh, one joint texture (a row per character). */
export class VariantBucket {
  mesh: InstancedMesh;
  texture: DataTexture;
  private readonly uniform: { value: DataTexture };
  private readonly material: MeshStandardMaterial;
  private capacity: number;

  constructor(private readonly lib: CharacterLibrary, private readonly variant: string, private readonly parent: Group) {
    this.capacity = MIN_CAPACITY;
    this.texture = createJointTexture(this.capacity);
    this.uniform = { value: this.texture };
    this.material = createCharacterMaterial(lib.map, this.uniform);
    this.mesh = this.createMesh();
  }

  private createMesh(): InstancedMesh {
    const geo = this.lib.variants.get(this.variant);
    if (!geo) throw new Error(`[crowd] unknown character variant "${this.variant}"`);
    const mesh = new InstancedMesh(geo, this.material, this.capacity);
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.raycast = () => {};
    mesh.name = `crowd:${this.variant}`;
    this.parent.add(mesh);
    return mesh;
  }

  /** Makes room for `count` characters (re-creating the mesh/texture only when growing). */
  resize(count: number): void {
    if (count > this.capacity) {
      this.capacity = grow(this.capacity, count);
      this.texture.dispose();
      this.texture = createJointTexture(this.capacity);
      this.uniform.value = this.texture;
      this.parent.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = this.createMesh();
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
  }

  get data(): Float32Array {
    return this.texture.image.data as Float32Array;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
    this.texture.dispose();
    this.material.dispose();
  }
}

/** Soft round contact shadow under every character: one instanced draw call. */
export class BlobShadows {
  mesh: InstancedMesh;
  private capacity = 0;
  private readonly geometry: PlaneGeometry;
  private readonly material: MeshBasicMaterial;

  constructor(private readonly parent: Group) {
    this.geometry = new PlaneGeometry(1, 1);
    this.geometry.rotateX(-Math.PI / 2);
    this.material = new MeshBasicMaterial({ map: getShadowTexture(), transparent: true, depthWrite: false, toneMapped: false });
    this.mesh = this.create(MIN_CAPACITY);
  }

  private create(capacity: number): InstancedMesh {
    this.capacity = capacity;
    const mesh = new InstancedMesh(this.geometry, this.material, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    mesh.raycast = () => {};
    this.parent.add(mesh);
    return mesh;
  }

  resize(count: number): void {
    if (count > this.capacity) {
      this.parent.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = this.create(grow(this.capacity, count));
    }
    this.mesh.count = count;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
