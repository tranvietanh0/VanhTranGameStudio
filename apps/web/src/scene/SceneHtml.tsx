import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useMemo, type ComponentProps } from "react";

/** Keep scene overlays under the DOM UI layer (z-index 10). */
export const OVERLAY_Z: [number, number] = [5, 0];

/**
 * drei <Html> pinned to a stable portal (the canvas container). Without it, Html's mount target
 * switches once R3F connects its event source, which unmounts and recreates every overlay root
 * during an R3F commit (React then logs a synchronous-unmount race).
 */
export function SceneHtml(props: ComponentProps<typeof Html>) {
  const gl = useThree((s) => s.gl);
  const portal = useMemo(() => ({ current: gl.domElement.parentNode as HTMLElement }), [gl]);
  return <Html portal={portal} zIndexRange={OVERLAY_Z} {...props} />;
}
