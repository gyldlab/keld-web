import type { CameraSpec, SceneConfig } from "@/components/hero/_types/scene-runtime";
import type { ScenePreset, Vec3 } from "@/components/hero/editor/scene-preset";
import { isStoneId } from "@/components/hero/editor/stone-catalog";

/** Only physical scene changes require a new environment reflection capture. */
export function reflectionSignature(value: ScenePreset): string {
  return JSON.stringify({
    lights: value.lights,
    materials: value.materials,
    objects: value.objects,
    shadows: value.shadows,
    stone: value.stone,
    background: value.atmosphere.background,
    fogColor: value.atmosphere.fogColor,
    fogDensity: value.atmosphere.fogDensity,
    hemisphereIntensity: value.atmosphere.hemisphereIntensity,
  });
}

export function readConfig(raw: unknown): SceneConfig {
  const config = raw as SceneConfig;
  const vec = (value: unknown): value is Vec3 =>
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
  const bounded = (value: unknown, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  const camera = (value: CameraSpec | undefined) =>
    value &&
    vec(value.position) &&
    vec(value.target) &&
    bounded(value.fov, 10.01, 99.99) &&
    bounded(value.near ?? 0.1, 0.0001, 100) &&
    bounded(value.far ?? 100, (value.near ?? 0.1) + 0.0001, 10000);
  const color = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  if (
    !config ||
    config.version !== 1 ||
    !camera(config.cameras?.desktop) ||
    !camera(config.cameras?.mobile) ||
    !Array.isArray(config.lights) ||
    config.lights.length > 12 ||
    !bounded(config.durationSeconds, 0.05, 5) ||
    !vec(config.reflection?.position)
  ) {
    throw new Error("Invalid live scene configuration.");
  }
  if (
    !color(config.background) ||
    !bounded(config.exposure, 0.1, 4) ||
    typeof config.animation !== "string" ||
    !config.animation
  )
    throw new Error("Invalid scene appearance configuration.");
  for (const value of [
    config.environmentIntensity,
    config.hemisphereIntensity,
    config.areaIntensityScale,
  ]) {
    if (value !== undefined && !bounded(value, 0, 4))
      throw new Error("Invalid scene illumination.");
  }
  if (config.fog && (!color(config.fog.color) || !bounded(config.fog.density, 0, 0.2)))
    throw new Error("Invalid atmosphere configuration.");
  if (
    config.volume &&
    (!vec(config.volume.position) ||
      !vec(config.volume.size) ||
      config.volume.size.some((value) => value <= 0 || value > 100))
  ) {
    throw new Error("Invalid physical atmosphere volume.");
  }
  if (config.renderMode !== undefined && !["pathtraced", "raster"].includes(config.renderMode)) {
    throw new Error("Unsupported rendering mode.");
  }
  if (
    config.stone &&
    (!isStoneId(config.stone.id) ||
      !color(config.stone.tint) ||
      !bounded(config.stone.tiling, 0.15, 4) ||
      !bounded(config.stone.normalStrength, 0, 1))
  ) {
    throw new Error("Invalid authored stone configuration.");
  }
  const dof = config.depthOfField;
  if (
    dof &&
    (!vec(dof.target) ||
      !bounded(dof.aperture, 0, 0.002) ||
      !bounded(dof.maxBlur, 0, 0.005) ||
      typeof dof.desktopOnly !== "boolean")
  )
    throw new Error("Invalid depth-of-field configuration.");
  if (config.reflection.enabled !== undefined && typeof config.reflection.enabled !== "boolean")
    throw new Error("Invalid reflection toggle.");
  if (!bounded(config.reflection.width, 0.01, 100) || !bounded(config.reflection.depth, 0.01, 100))
    throw new Error("Invalid reflection surface.");
  const sweep = config.finishSweep;
  if (
    sweep &&
    (!bounded(sweep.start, 0, config.durationSeconds) ||
      !bounded(sweep.end, sweep.start + 0.1, config.durationSeconds) ||
      !vec(sweep.from) ||
      !vec(sweep.to) ||
      !vec(sweep.target) ||
      !bounded(sweep.intensity, 0, 40) ||
      !bounded(sweep.width, 0.01, 10) ||
      !bounded(sweep.height, 0.01, 10))
  )
    throw new Error("Invalid finish-sweep configuration.");
  for (const light of config.lights) {
    if (
      !vec(light.position) ||
      !vec(light.target) ||
      !color(light.color) ||
      !bounded(light.intensity, 0, 10000) ||
      !bounded(light.width, 0.01, 100) ||
      !bounded(light.height, 0.01, 100) ||
      !["area", "spot"].includes(light.type)
    )
      throw new Error("Invalid scene light configuration.");
    if (
      (light.angle !== undefined && !bounded(light.angle, 0.001, Math.PI / 2)) ||
      (light.penumbra !== undefined && !bounded(light.penumbra, 0, 1)) ||
      (light.distance !== undefined && !bounded(light.distance, 0, 1000)) ||
      (light.decay !== undefined && !bounded(light.decay, 0, 4))
    )
      throw new Error("Invalid spot-light projection.");
  }
  return config;
}
