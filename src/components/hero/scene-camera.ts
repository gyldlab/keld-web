import type { PerspectiveCamera } from "three";

import type { CameraSpec } from "@/components/hero/_types/scene-runtime";

/** A short perspective move that finishes exactly at the authored composition. */
export function frameSceneCamera(
  camera: PerspectiveCamera,
  spec: CameraSpec,
  authored: CameraSpec,
  width: number,
  height: number,
  compact: boolean,
  progress: number,
) {
  const t = Math.max(0, Math.min(1, progress / 0.9));
  const remaining = 1 - t * t * (3 - 2 * t);
  const yaw = remaining * (compact ? -0.035 : -0.065);
  const distance = 1 + remaining * (compact ? 0.07 : 0.1);
  const dx = spec.position[0] - spec.target[0];
  const dy = spec.position[1] - spec.target[1];
  const dz = spec.position[2] - spec.target[2];
  camera.position.set(
    spec.target[0] + (dx * Math.cos(yaw) + dz * Math.sin(yaw)) * distance,
    spec.target[1] + dy * distance + remaining * 0.12,
    spec.target[2] + (dz * Math.cos(yaw) - dx * Math.sin(yaw)) * distance,
  );
  camera.lookAt(...spec.target);
  // Contain the approved silhouette, including narrow portrait viewports.
  const authoredAspect = compact ? 4 / 5 : 16 / 9;
  const containScale = Math.max(1, authoredAspect / (width / height));
  camera.fov = (2 * Math.atan(Math.tan((spec.fov * Math.PI) / 360) * containScale) * 180) / Math.PI;
  camera.aspect = width / height;
  camera.near = authored.near ?? 0.1;
  camera.far = authored.far ?? 100;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
