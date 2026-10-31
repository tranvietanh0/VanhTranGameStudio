import { useLayoutEffect, useMemo, useRef } from "react";
import { Object3D, PlaneGeometry, type InstancedMesh } from "three";
import type { Team } from "@studio/shared";
import { capacityFor, commitMatrices, MATERIALS } from "./instancing";
import { chairPosition, deskCenter, type OfficeLayout } from "./layout";

const dummy = new Object3D();
let plane: PlaneGeometry | null = null;

/** Unit ground plane lying flat at y≈0, shared by all blob shadows. */
export function shadowPlane(): PlaneGeometry {
  if (!plane) {
    plane = new PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    plane.translate(0, 0.025, 0);
  }
  return plane;
}

interface Blob {
  x: number;
  z: number;
  sx: number;
  sz: number;
}

interface Props {
  layout: OfficeLayout;
  teams: Team[];
}

/** Fake contact shadows for props, desks and chairs: one instanced, textured draw call. */
export function Shadows({ layout, teams }: Props) {
  const mesh = useRef<InstancedMesh>(null);
  const blobs = useMemo<Blob[]>(() => {
    const list: Blob[] = layout.props.map((p) => ({ x: p.x + p.w / 2, z: p.z + p.d / 2, sx: p.w + 0.5, sz: p.d + 0.6 }));
    for (const t of teams) {
      const d = deskCenter(t.slot);
      const c = chairPosition(t.slot);
      list.push({ x: d.x, z: d.z, sx: 2.7, sz: 1.6 }, { x: c.x, z: c.z + 0.1, sx: 1, sz: 1 });
    }
    return list;
  }, [layout.props, teams]);
  const capacity = capacityFor(blobs.length);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    blobs.forEach((b, i) => {
      dummy.position.set(b.x, 0, b.z);
      dummy.scale.set(b.sx, 1, b.sz);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    commitMatrices(m, blobs.length);
  }, [blobs, capacity]);

  return (
    <instancedMesh
      key={capacity}
      ref={mesh}
      args={[shadowPlane(), MATERIALS.shadow, capacity]}
      renderOrder={1}
      raycast={() => null}
    />
  );
}
