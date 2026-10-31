import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Color, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene, type DirectionalLight } from "three";

/**
 * Key light comes from high up on the camera's left, so BOTH back walls (normals +x and +z) face it
 * and shadows fall softly behind the furniture instead of pooling in front of it.
 */
const SUN_DIR = { x: 0.3, y: 0.86, z: 0.42 } as const;
const SUN_DIST = 40;
const ENV_INTENSITY = 0.45;
/** Shadowed areas keep this much of the key light: soft, never black. */
const SHADOW_INTENSITY = 0.62;
/** Warm desk-lamp pool over the CEO's desk (no shadows, no extra draw call). */
const CEO_LAMP = { x: 3.6, y: 1.7, z: 3.2 } as const;

/** Warm "softbox" panels around a dark room, prefiltered once into a tiny environment map. */
function buildEnvScene(): Scene {
  const scene = new Scene();
  scene.background = new Color("#2a211b");
  const panel = (color: string, strength: number, w: number, h: number, pos: [number, number, number], rot: [number, number, number]) => {
    const mat = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(strength) });
    const mesh = new Mesh(new PlaneGeometry(w, h), mat);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    scene.add(mesh);
  };
  panel("#fff3e0", 1.6, 12, 12, [0, 6, 0], [Math.PI / 2, 0, 0]);
  panel("#ffd9a8", 0.8, 8, 3, [-6, 2, 4], [0, Math.PI / 2, 0]);
  panel("#cfe4ff", 0.5, 8, 3, [6, 2, -4], [0, -Math.PI / 2, 0]);
  return scene;
}

interface Props {
  width: number;
  depth: number;
  /** Bumped whenever the static office changes, to re-render the shadow map once. */
  shadowVersion: number;
}

/**
 * Warm key light with a soft shadow map that is rendered ONCE per layout change
 * (shadowMap.autoUpdate = false), a hemisphere fill, and a tiny procedural environment
 * (three softbox panels prefiltered once by PMREM) for soft ambient light and reflections. Nothing here costs a frame
 * while the office is idle.
 */
export function Lights({ width, depth, shadowVersion }: Props) {
  const sun = useRef<DirectionalLight>(null);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const cx = width / 2;
  const cz = depth / 2;
  const half = Math.hypot(width, depth) / 2 + 1;

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const envScene = buildEnvScene();
    const target = pmrem.fromScene(envScene, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = ENV_INTENSITY;
    envScene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as MeshBasicMaterial).dispose();
      }
    });
    pmrem.dispose();
    invalidate();
    return () => {
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
    };
  }, [gl, scene, invalidate]);

  useLayoutEffect(() => {
    const light = sun.current;
    if (!light) return;
    light.target.position.set(cx, 0, cz);
    light.target.updateMatrixWorld();
    const cam = light.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = SUN_DIST * 2;
    cam.updateProjectionMatrix();
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, cx, cz, half, shadowVersion]);

  return (
    <>
      <hemisphereLight args={["#fff6e6", "#cbb594", 0.85]} />
      {/* Cool-neutral fill from the window side so the left wall never goes muddy. */}
      <directionalLight position={[cx + 30, 14, cz - 6]} intensity={0.45} color="#eef3ff" />
      <pointLight position={[CEO_LAMP.x, CEO_LAMP.y, CEO_LAMP.z]} intensity={2.5} distance={6} decay={1.4} color="#ffd29a" />
      <directionalLight
        ref={sun}
        position={[cx + SUN_DIR.x * SUN_DIST, SUN_DIR.y * SUN_DIST, cz + SUN_DIR.z * SUN_DIST]}
        intensity={2.0}
        color="#fff0d8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.025}
        shadow-radius={5}
        shadow-intensity={SHADOW_INTENSITY}
      />
    </>
  );
}
