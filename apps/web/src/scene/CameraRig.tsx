import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Vector3, type Camera, type OrthographicCamera } from "three";
import { useOfficeStore } from "../store/officeStore";
import { deskCenter } from "./layout";
import { ceo, focus, focusPoint, input } from "./runtime";

const YAW = Math.PI / 4;
const PITCH = (35 * Math.PI) / 180;
const DISTANCE = 40;
/** Camera offset from its look-at target: yaw 45°, pitch 35°, looking towards -x/-z. */
const OFFSET = new Vector3(
  Math.sin(YAW) * Math.cos(PITCH),
  Math.sin(PITCH),
  Math.cos(YAW) * Math.cos(PITCH),
).multiplyScalar(DISTANCE);

/**
 * While following the CEO, the camera looks a little ahead of them (towards the camera, so the
 * avatar sits above screen centre): the office in front fills the frame instead of the sky
 * behind the back walls.
 */
const FOLLOW_AHEAD = { x: 2, z: 2 } as const;

export const ZOOM_MIN = 18;
export const ZOOM_MAX = 120;
const FOLLOW_RATE = 5;
const ZOOM_RATE = 10;
const WHEEL_SPEED = 0.0015;

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/** Fits roughly 22 tiles across the shorter screen side. */
function initialZoom(): number {
  return clampZoom(Math.min(window.innerWidth, window.innerHeight * 1.5) / 22);
}

function isOrtho(cam: Camera): cam is OrthographicCamera {
  return (cam as OrthographicCamera).isOrthographicCamera === true;
}

/** Smooth follow of the CEO (or a selected desk), wheel and pinch zoom with limits. */
export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const target = useRef(new Vector3(ceo.x + FOLLOW_AHEAD.x, 0, ceo.z + FOLLOW_AHEAD.z));
  const zoomGoal = useRef(initialZoom());

  useLayoutEffect(() => {
    if (!isOrtho(camera)) throw new Error("[scene] CameraRig needs an orthographic camera");
    camera.zoom = zoomGoal.current;
    camera.position.copy(target.current).add(OFFSET);
    camera.lookAt(target.current);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate]);

  // Selecting a team anywhere (desk click, inbox, drawer) flies the camera to its desk.
  useEffect(
    () =>
      useOfficeStore.subscribe((s, prev) => {
        if (!s.selectedTeamId || s.selectedTeamId === prev.selectedTeamId) return;
        const team = s.teams[s.selectedTeamId];
        if (team) focusPoint(deskCenter(team.slot));
      }),
    [],
  );

  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStart = 0;
    let zoomAtPinch = 0;
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomGoal.current = clampZoom(zoomGoal.current * Math.exp(-e.deltaY * WHEEL_SPEED));
      invalidate();
    };
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        pinchStart = spread();
        zoomAtPinch = zoomGoal.current;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size !== 2 || pinchStart <= 0) return;
      zoomGoal.current = clampZoom(zoomAtPinch * (spread() / pinchStart));
      input.lastPinchAt = performance.now();
      invalidate();
    };
    const onUp = (e: PointerEvent) => {
      if (pointers.size === 2) input.lastPinchAt = performance.now();
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl, invalidate]);

  useFrame((state, rawDt) => {
    const cam = state.camera;
    if (!isOrtho(cam)) return;
    const dt = Math.min(rawDt, 0.05);
    const t = target.current;
    const gx = focus.mode === "ceo" ? ceo.x + FOLLOW_AHEAD.x : focus.x;
    const gz = focus.mode === "ceo" ? ceo.z + FOLLOW_AHEAD.z : focus.z;
    const dist = Math.hypot(gx - t.x, gz - t.z);
    const zoomDiff = zoomGoal.current - cam.zoom;
    const settled = dist < 0.003 && Math.abs(zoomDiff) < 0.01;

    if (settled) {
      t.set(gx, 0, gz);
      cam.zoom = zoomGoal.current;
    } else {
      const k = 1 - Math.exp(-dt * FOLLOW_RATE);
      t.x += (gx - t.x) * k;
      t.z += (gz - t.z) * k;
      cam.zoom += zoomDiff * (1 - Math.exp(-dt * ZOOM_RATE));
    }
    if (zoomDiff !== 0) cam.updateProjectionMatrix();
    cam.position.copy(t).add(OFFSET);
    cam.lookAt(t);
    if (!settled) state.invalidate();
  });

  return null;
}

/** Current camera zoom (pixels per world unit), read by overlays to decide label density. */
export function readZoom(cam: Camera): number {
  return isOrtho(cam) ? cam.zoom : ZOOM_MIN;
}
