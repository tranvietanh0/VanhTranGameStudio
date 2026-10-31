import { useGLTF } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { MATERIALS } from "./instancing";
import { Kit, KIT_URL } from "./kit";
import { tileOf, type OfficeLayout } from "./layout";
import { buildOfficeGeometry } from "./officeBuild";
import { CLICK_SLOP_PX, focusCeo, isTapSuppressed, walkToTile } from "./runtime";

interface Props {
  layout: OfficeLayout;
  /** Occupied slots; the office is rebuilt only when this set changes. */
  slots: readonly number[];
  /** Called after a rebuild so the (static, render-once) shadow map is refreshed. */
  onRebuilt: () => void;
}

/**
 * The whole static office in three draw calls: lit solid (floor, walls, all furniture), unlit glow
 * (windows, lamp shades) and glass. A transparent floor plane takes the clicks: tapping the floor
 * walks the CEO there via A*.
 */
export function Room({ layout, slots, onRebuilt }: Props) {
  const gltf = useGLTF(KIT_URL, false);
  const kit = useMemo(() => new Kit(gltf.scene), [gltf]);
  const invalidate = useThree((s) => s.invalidate);
  const geo = useMemo(() => buildOfficeGeometry(kit, layout, slots), [kit, layout, slots]);

  useEffect(() => () => kit.dispose(), [kit]);
  useEffect(() => {
    onRebuilt();
    invalidate();
    return () => {
      geo.solid.dispose();
      geo.glow.dispose();
      geo.glass.dispose();
    };
  }, [geo, onRebuilt, invalidate]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > CLICK_SLOP_PX || isTapSuppressed()) return;
    if (walkToTile(tileOf(e.point.x, e.point.z))) focusCeo();
  };

  return (
    <group>
      <mesh geometry={geo.solid} material={MATERIALS.solid} castShadow receiveShadow raycast={() => null} />
      <mesh geometry={geo.glow} material={MATERIALS.glow} raycast={() => null} />
      <mesh geometry={geo.glass} material={MATERIALS.glass} renderOrder={2} raycast={() => null} />
      <mesh position={[layout.width / 2, 0, layout.depth / 2]} rotation={[-Math.PI / 2, 0, 0]} onClick={onClick}>
        <planeGeometry args={[layout.width, layout.depth]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}

useGLTF.preload(KIT_URL, false);
