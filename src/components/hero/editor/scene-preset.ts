import type {
  LightTuning,
  MaterialTuning,
  ScenePreset,
  Vec3,
} from "@/components/hero/_types/scene-preset";
/**
 * Transportable, scene-specific tuning data. No Three.js objects, DOM handles
 * or code paths are serialized. The approved logo mesh is never part of a preset.
 */
import { isStoneId } from "@/components/hero/editor/stone-catalog";
export type {
  Vec3,
  StoneTuning,
  MaterialTuning,
  LightTuning,
  ScenePreset,
} from "@/components/hero/_types/scene-preset";

export function copyPreset(preset: ScenePreset): ScenePreset {
  return JSON.parse(JSON.stringify(preset)) as ScenePreset;
}

function fail(field: string): never {
  throw new Error(`Invalid or unsupported preset field: ${field}`);
}

function record(input: unknown, keys: string[], path: string): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) fail(path);
  const value = input as Record<string, unknown>;
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) fail(path);
  return value;
}

function number(value: unknown, lo: number, hi: number, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < lo || value > hi) fail(field);
  return value as number;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") fail(field);
  return value as boolean;
}

function color(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) fail(field);
  return value as string;
}

function vector(input: unknown, field: string): Vec3 {
  if (!Array.isArray(input) || input.length !== 3) fail(field);
  return [
    number(input[0], -40, 40, field + ".x"),
    number(input[1], -40, 40, field + ".y"),
    number(input[2], -40, 40, field + ".z"),
  ];
}

function material(input: unknown, field: string): MaterialTuning {
  const m = record(input, ["color", "metalness", "roughness"], field);
  return {
    color: color(m.color, field + ".color"),
    metalness: number(m.metalness, 0, 1, field + ".metalness"),
    roughness: number(m.roughness, 0.04, 1, field + ".roughness"),
  };
}

/**
 * Reject malformed and cross-asset JSON before changing a live renderer.
 * No unrestricted object merge, eval, script execution or external URLs.
 */
export function parsePreset(input: unknown, baseline: ScenePreset): ScenePreset {
  const keys = [
    "kind",
    "version",
    "asset",
    "camera",
    "atmosphere",
    "shadows",
    "materials",
    "effects",
    "objects",
    "lights",
  ];
  // Old V4/V6 drafts didn't have a stone field. Preserve them, but strictly
  // reject unknown fields in both the old and new representations.
  const hasStone =
    !!input &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    Object.prototype.hasOwnProperty.call(input, "stone");
  const p = record(input, hasStone ? [...keys, "stone"] : keys, "preset");
  if (p.kind !== "keld.scene.tuning" || p.version !== 1 || p.asset !== baseline.asset) {
    fail("preset.version/asset");
  }
  const camera = record(p.camera, ["position", "target", "fov"], "camera");
  const hasMovingFog =
    !!p.atmosphere &&
    typeof p.atmosphere === "object" &&
    Object.prototype.hasOwnProperty.call(p.atmosphere, "movingFog");
  const at = record(
    p.atmosphere,
    [
      "background",
      "exposure",
      "environmentIntensity",
      "hemisphereIntensity",
      "fogColor",
      "fogDensity",
      ...(hasMovingFog ? ["movingFog"] : []),
    ],
    "atmosphere",
  );
  const moving = hasMovingFog
    ? record(at.movingFog, ["color", "cursorStrength", "density", "speed"], "atmosphere.movingFog")
    : baseline.atmosphere.movingFog;
  const sh = record(
    p.shadows,
    ["enabled", "opacity", "radius", "bias", "normalBias", "mapSize"],
    "shadows",
  );
  const mt = record(p.materials, ["graphite", "titanium", "basalt"], "materials");
  const stone = hasStone
    ? record(p.stone, ["id", "tint", "tiling", "normalStrength"], "stone")
    : baseline.stone;
  const fx = record(
    p.effects,
    [
      "bloomEnabled",
      "bloomStrength",
      "bloomRadius",
      "bloomThreshold",
      "depthOfFieldEnabled",
      "aperture",
      "maxBlur",
      "sweepIntensity",
    ],
    "effects",
  );
  const objects = record(p.objects, ["upper", "lower", "slab"], "objects");
  if (!Array.isArray(p.lights) || p.lights.length !== baseline.lights.length) fail("lights");
  const lights = p.lights.map((item, index) => {
    const l = record(
      item,
      [
        "name",
        "type",
        "enabled",
        "color",
        "intensity",
        "position",
        "target",
        "width",
        "height",
        "angle",
        "penumbra",
        "distance",
        "decay",
      ],
      `lights[${index}]`,
    );
    if (l.name !== baseline.lights[index].name || l.type !== baseline.lights[index].type) {
      fail(`lights[${index}].identity`);
    }
    return {
      name: l.name as string,
      type: l.type as LightTuning["type"],
      enabled: boolean(l.enabled, "light.enabled"),
      color: color(l.color, "light.color"),
      intensity: number(l.intensity, 0, 2000, "light.intensity"),
      position: vector(l.position, "light.position"),
      target: vector(l.target, "light.target"),
      width: number(l.width, 0.05, 30, "light.width"),
      height: number(l.height, 0.05, 30, "light.height"),
      angle: number(l.angle, 0.001, Math.PI / 2, "light.angle"),
      penumbra: number(l.penumbra, 0, 1, "light.penumbra"),
      distance: number(l.distance, 0, 1000, "light.distance"),
      decay: number(l.decay, 0, 4, "light.decay"),
    };
  });
  const shadowSize = number(sh.mapSize, 512, 2048, "shadows.mapSize");
  if (shadowSize !== 512 && shadowSize !== 1024 && shadowSize !== 2048) fail("shadows.mapSize");
  if (!isStoneId(stone.id)) fail("stone.id");

  const output: ScenePreset = {
    kind: "keld.scene.tuning",
    version: 1,
    asset: baseline.asset,
    camera: {
      position: vector(camera.position, "camera.position"),
      target: vector(camera.target, "camera.target"),
      fov: number(camera.fov, 12, 90, "camera.fov"),
    },
    atmosphere: {
      background: color(at.background, "atmosphere.background"),
      exposure: number(at.exposure, 0.1, 4, "atmosphere.exposure"),
      environmentIntensity: number(
        at.environmentIntensity,
        0,
        2,
        "atmosphere.environmentIntensity",
      ),
      hemisphereIntensity: number(at.hemisphereIntensity, 0, 2, "atmosphere.hemisphereIntensity"),
      fogColor: color(at.fogColor, "atmosphere.fogColor"),
      fogDensity: number(at.fogDensity, 0, 0.05, "atmosphere.fogDensity"),
      movingFog: {
        color: color(moving.color, "atmosphere.movingFog.color"),
        cursorStrength: number(moving.cursorStrength, 0, 2, "atmosphere.movingFog.cursorStrength"),
        density: number(moving.density, 0, 0.25, "atmosphere.movingFog.density"),
        speed: number(moving.speed, 0, 3, "atmosphere.movingFog.speed"),
      },
    },
    shadows: {
      enabled: boolean(sh.enabled, "shadows.enabled"),
      opacity: number(sh.opacity, 0, 1, "shadows.opacity"),
      radius: number(sh.radius, 0, 8, "shadows.radius"),
      bias: number(sh.bias, -0.01, 0.01, "shadows.bias"),
      normalBias: number(sh.normalBias, -0.05, 0.05, "shadows.normalBias"),
      mapSize: shadowSize,
    },
    materials: {
      graphite: material(mt.graphite, "materials.graphite"),
      titanium: material(mt.titanium, "materials.titanium"),
      basalt: material(mt.basalt, "materials.basalt"),
    },
    stone: {
      id: stone.id,
      tint: color(stone.tint, "stone.tint"),
      tiling: number(stone.tiling, 0.15, 4, "stone.tiling"),
      normalStrength: number(stone.normalStrength, 0, 1, "stone.normalStrength"),
    },
    effects: {
      bloomEnabled: boolean(fx.bloomEnabled, "effects.bloomEnabled"),
      bloomStrength: number(fx.bloomStrength, 0, 2, "effects.bloomStrength"),
      bloomRadius: number(fx.bloomRadius, 0, 1, "effects.bloomRadius"),
      bloomThreshold: number(fx.bloomThreshold, 0, 5, "effects.bloomThreshold"),
      depthOfFieldEnabled: boolean(fx.depthOfFieldEnabled, "effects.depthOfFieldEnabled"),
      aperture: number(fx.aperture, 0, 0.002, "effects.aperture"),
      maxBlur: number(fx.maxBlur, 0, 0.005, "effects.maxBlur"),
      sweepIntensity: number(fx.sweepIntensity, 0, 40, "effects.sweepIntensity"),
    },
    objects: {
      upper: vector(objects.upper, "objects.upper"),
      lower: vector(objects.lower, "objects.lower"),
      slab: vector(objects.slab, "objects.slab"),
    },
    lights,
  };
  if (
    Math.hypot(
      output.camera.position[0] - output.camera.target[0],
      output.camera.position[1] - output.camera.target[1],
      output.camera.position[2] - output.camera.target[2],
    ) < 0.2
  )
    fail("camera.position/target");
  return output;
}
