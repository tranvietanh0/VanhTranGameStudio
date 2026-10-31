import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { MATERIALS } from "./instancing";
import { tileOf, type OfficeLayout } from "./layout";
import { CLICK_SLOP_PX, focusCeo, isTapSuppressed, walkToTile } from "./runtime";
import { buildGlassGeometry, buildStaticGeometry } from "./staticOffice";

interface Props {
  layout: OfficeLayout;
}

/**
 * The whole static office in two draw calls (opaque merged mesh + glass). Tapping it walks the
 * CEO there via A*; a tap on an obstacle tile is ignored.
 */
export function Room({ layout }: Props) {
  const staticGeo = useMemo(() => buildStaticGeometry(layout), [layout.width, layout.depth, layout.rows]);
  const glassGeo = useMemo(() => buildGlassGeometry(), []);

  useEffect(() => () => staticGeo.dispose(), [staticGeo]);
  useEffect(() => () => glassGeo.dispose(), [glassGeo]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > CLICK_SLOP_PX || isTapSuppressed()) return;
    if (walkToTile(tileOf(e.point.x, e.point.z))) focusCeo();
  };

  return (
    <group>
      <mesh geometry={staticGeo} material={MATERIALS.vertex} onClick={onClick} />
      <mesh geometry={glassGeo} material={MATERIALS.glass} renderOrder={2} raycast={() => null} />
    </group>
  );
}
