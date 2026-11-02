import type { Material, Object3D } from "three";
import {
  Color,
  FogExp2,
  Group,
  type HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  RectAreaLight,
  type Scene,
  SpotLight,
  type WebGLRenderer,
} from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import type { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import type { SocialTuning } from "@/components/hero/_types/scene-preset";
import { type AtmospherePass, DEFAULT_ATMOSPHERE } from "@/components/hero/atmosphere-pass";
import {
  copyPreset,
  type MaterialTuning,
  parsePreset,
  type ScenePreset,
} from "@/components/hero/editor/scene-preset";
import { createStoneTextures } from "@/components/hero/editor/stone-textures";
import type { SceneConfig } from "@/components/hero/scene-runtime";
import { createDefaultSocialTuning } from "@/components/hero/social-settings";

type Bindings = {
  atmospherePass?: AtmospherePass;
  socials?: { configure: (settings: SocialTuning) => void };
  source: SceneConfig;
  scene: Scene;
  model: GLTF;
  renderer: WebGLRenderer;
  hemisphere: HemisphereLight;
  lights: Array<RectAreaLight | SpotLight>;
  bloom?: UnrealBloomPass;
  defocus?: BokehPass;
  volume?: MeshStandardMaterial & { density: number };
};

import type { SceneTuner } from "@/components/hero/_types/scene-tuner";
export type { SceneTuner } from "@/components/hero/_types/scene-tuner";

function hex(color: Color): string {
  return `#${color.getHexString()}`;
}

function findMaterial(root: Object3D, name: string): MeshStandardMaterial[] {
  const result = new Set<MeshStandardMaterial>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial && material.name === name) result.add(material);
    }
  });
  if (!result.size) throw new Error(`The authored material is missing: ${name}`);
  return [...result];
}

function findAtmosphereMaterials(root: Object3D): Material[] {
  const result = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.name === "Aperture Mist") result.add(material);
    }
  });
  // Atmosphere cards are optional; the physical asset has no painted haze mesh.
  return [...result];
}

function materialDefaults(material: MeshStandardMaterial): MaterialTuning {
  return {
    color: hex(material.color),
    metalness: material.metalness,
    roughness: material.roughness,
  };
}

function materialApply(materials: MeshStandardMaterial[], values: MaterialTuning) {
  for (const material of materials) {
    material.color.set(values.color);
    material.metalness = values.metalness;
    material.roughness = values.roughness;
  }
}

/**
 * Add a separate tuning parent so AnimationMixer can continue animating the
 * authored glTF node without overwriting editor translations after each frame.
 * Neither node mesh nor any animation track is edited.
 */
function offsetParent(model: GLTF, objectName: string): Group {
  const object = model.scene.getObjectByName(objectName);
  if (!object?.parent) throw new Error(`Missing staged logo node: ${objectName}`);
  const parent = object.parent;
  const group = new Group();
  group.name = `KELD_TuningOffset_${objectName}`;
  parent.add(group);
  group.add(object);
  return group;
}

/** Holds direct Three.js bindings, separate from React/lil-gui/preset IO. */
export function createSceneTuner({
  atmospherePass,
  socials,
  source,
  scene,
  model,
  renderer,
  hemisphere,
  lights,
  bloom,
  defocus,
  volume,
}: Bindings): SceneTuner {
  const upper = offsetParent(model, "LogoUpper");
  const lower = offsetParent(model, "LogoLower");
  const slab = model.scene.getObjectByName("BasaltMonolith");
  if (!slab) throw new Error("The basalt object is missing.");
  const anchoredSlab: Object3D = slab;
  const slabBase = anchoredSlab.position.clone();
  const graphite = findMaterial(model.scene, "KELD Graphite");
  const titanium = findMaterial(model.scene, "KELD Titanium");
  const basalt = findMaterial(model.scene, "Rough basalt monolith");
  const mist = volume ? [] : findAtmosphereMaterials(model.scene);
  const stone = createStoneTextures(basalt, renderer, source.stone?.id);
  const isCompact = matchMedia("(max-width: 900px), (max-aspect-ratio: 1/1)").matches;
  const cameraSpec = isCompact ? source.cameras.mobile : source.cameras.desktop;
  const spot = lights.find((light): light is SpotLight => light instanceof SpotLight);
  const defaults: ScenePreset = {
    kind: "keld.scene.tuning",
    version: 1,
    asset: source.revision ?? "keld-staged-hero",
    camera: {
      position: [...cameraSpec.position],
      target: [...cameraSpec.target],
      fov: cameraSpec.fov,
    },
    atmosphere: {
      background: source.background,
      exposure: source.exposure,
      environmentIntensity: source.environmentIntensity ?? 0.18,
      hemisphereIntensity: hemisphere.intensity,
      fogColor: source.fog?.color ?? source.background,
      fogDensity: source.fog?.density ?? 0,
      movingFog: { ...DEFAULT_ATMOSPHERE },
    },
    shadows: {
      enabled: renderer.shadowMap.enabled,
      opacity: spot?.shadow.intensity ?? 0,
      radius: spot?.shadow.radius ?? 2,
      bias: spot?.shadow.bias ?? 0,
      normalBias: spot?.shadow.normalBias ?? 0,
      mapSize: (spot?.shadow.mapSize.x ?? 1024) as 512 | 1024 | 2048,
    },
    materials: {
      graphite: materialDefaults(graphite[0]),
      titanium: materialDefaults(titanium[0]),
      basalt: materialDefaults(basalt[0]),
    },
    stone: source.stone
      ? { ...source.stone }
      : { id: "authored", tint: "#8c969e", tiling: 0.55, normalStrength: 0.22 },
    effects: {
      bloomEnabled: bloom?.enabled ?? false,
      bloomStrength: bloom?.strength ?? 0,
      bloomRadius: bloom?.radius ?? 0,
      bloomThreshold: bloom?.threshold ?? 1,
      depthOfFieldEnabled: defocus?.enabled ?? !!volume,
      aperture: source.depthOfField?.aperture ?? 0,
      maxBlur: source.depthOfField?.maxBlur ?? 0,
      sweepIntensity: source.finishSweep?.intensity ?? 0,
    },
    objects: { upper: [0, 0, 0], lower: [0, 0, 0], slab: [0, 0, 0] },
    socials: createDefaultSocialTuning(),
    lights: source.lights.map((spec) => {
      const light = lights.find((item) => item.name === spec.name);
      if (!light) throw new Error(`Missing light: ${spec.name}`);
      return {
        name: spec.name,
        type: spec.type,
        enabled: light.visible,
        color: hex(light.color),
        intensity: light.intensity,
        position: [light.position.x, light.position.y, light.position.z],
        target: [...spec.target],
        width: spec.width,
        height: spec.height,
        angle: spec.angle ?? 0.5,
        penumbra: spec.penumbra ?? 0,
        distance: spec.distance ?? 35,
        decay: spec.decay ?? 2,
      };
    }),
  };

  let current = copyPreset(defaults);
  let lastMapSize = defaults.shadows.mapSize;
  let appliedRevision = 0;
  let disposed = false;

  async function apply(input: unknown): Promise<boolean> {
    if (disposed) return false;
    // Validate every field before initiating any asset request/mutation.
    const next = parsePreset(input, defaults);
    const request = ++appliedRevision;
    // Load chosen maps and verify the whole set BEFORE changing the displayed
    // slab. Late selections lose; no stale promise can overwrite a newer one.
    const selected = await stone.select(next.stone);
    if (!selected || disposed || request !== appliedRevision) return false;
    atmospherePass?.configure(next.atmosphere.movingFog);
    scene.background = new Color(next.atmosphere.background);
    scene.fog =
      !volume && next.atmosphere.fogDensity > 0
        ? new FogExp2(next.atmosphere.fogColor, next.atmosphere.fogDensity)
        : null;
    if (volume) {
      volume.density = next.atmosphere.fogDensity;
      volume.color.set(next.atmosphere.fogColor);
    }
    // Fog density also scales the localized veil around the opening.
    for (const material of mist) material.opacity = Math.min(1, next.atmosphere.fogDensity / 0.004);
    scene.environmentIntensity = next.atmosphere.environmentIntensity;
    hemisphere.intensity = next.atmosphere.hemisphereIntensity;
    renderer.toneMappingExposure = next.atmosphere.exposure;
    renderer.shadowMap.enabled = next.shadows.enabled;

    materialApply(graphite, next.materials.graphite);
    materialApply(titanium, next.materials.titanium);
    materialApply(basalt, {
      ...next.materials.basalt,
      color: next.stone.id === "authored" ? next.materials.basalt.color : next.stone.tint,
    });
    upper.position.fromArray(next.objects.upper);
    lower.position.fromArray(next.objects.lower);
    anchoredSlab.position.set(
      slabBase.x + next.objects.slab[0],
      slabBase.y + next.objects.slab[1],
      slabBase.z + next.objects.slab[2],
    );
    socials?.configure(next.socials);

    for (let i = 0; i < lights.length; i++) {
      const live = lights[i];
      const value = next.lights[i];
      live.visible = value.enabled;
      live.color.set(value.color);
      live.intensity = value.intensity;
      live.position.fromArray(value.position);
      if (live instanceof RectAreaLight) {
        live.width = value.width;
        live.height = value.height;
        live.lookAt(...value.target);
      } else if (live instanceof SpotLight) {
        live.target.position.fromArray(value.target);
        live.target.updateMatrixWorld();
        live.angle = value.angle;
        live.penumbra = value.penumbra;
        live.distance = value.distance;
        live.decay = value.decay;
        live.castShadow = next.shadows.enabled && value.enabled;
        live.shadow.intensity = next.shadows.opacity;
        live.shadow.radius = next.shadows.radius;
        live.shadow.bias = next.shadows.bias;
        live.shadow.normalBias = next.shadows.normalBias;
        if (lastMapSize !== next.shadows.mapSize) {
          live.shadow.map?.dispose();
          live.shadow.map = null;
          live.shadow.mapSize.set(next.shadows.mapSize, next.shadows.mapSize);
        }
      }
    }
    lastMapSize = next.shadows.mapSize;
    renderer.shadowMap.needsUpdate = true;
    if (bloom) {
      bloom.enabled = next.effects.bloomEnabled;
      bloom.strength = next.effects.bloomStrength;
      bloom.radius = next.effects.bloomRadius;
      bloom.threshold = next.effects.bloomThreshold;
    }
    if (defocus) {
      // Compact-screen pass remains disabled by resize() regardless of GUI.
      defocus.enabled = next.effects.depthOfFieldEnabled && !isCompact;
      defocus.materialBokeh.uniforms.aperture.value = next.effects.aperture;
      defocus.materialBokeh.uniforms.maxblur.value = next.effects.maxBlur;
    }
    current = next;
    return true;
  }

  return {
    get: () => copyPreset(current),
    getDefaults: () => copyPreset(defaults),
    apply,
    syncOrbit(position, target) {
      const updated = copyPreset(current);
      updated.camera.position = [...position];
      updated.camera.target = [...target];
      // Camera movement does not rewrite the scene or any keyframe.
      current = parsePreset(updated, defaults);
    },
    dispose() {
      disposed = true;
      appliedRevision++;
      stone.dispose();
      // Do not detach children! The main renderer traverses gltf.scene when
      // disposing both logo meshes, shared materials, textures, and geometry.
    },
  };
}
