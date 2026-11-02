import type { StoneMaterialId } from "@/components/hero/_types/stone-catalog";

export type LightTuning = {
  angle: number;
  color: string;
  decay: number;
  distance: number;
  enabled: boolean;
  height: number;
  intensity: number;
  name: string;
  penumbra: number;
  position: Vec3;
  target: Vec3;
  type: "area" | "spot";
  width: number;
};

export type MaterialTuning = {
  color: string;
  metalness: number;
  roughness: number;
};

export type MovingFogTuning = {
  color: string;
  cursorStrength: number;
  density: number;
  speed: number;
};

export type ScenePreset = {
  asset: string;
  atmosphere: {
    background: string;
    environmentIntensity: number;
    exposure: number;
    fogColor: string;
    fogDensity: number;
    hemisphereIntensity: number;
    movingFog: MovingFogTuning;
  };
  camera: {
    fov: number;
    position: Vec3;
    target: Vec3;
  };
  effects: {
    aperture: number;
    bloomEnabled: boolean;
    bloomRadius: number;
    bloomStrength: number;
    bloomThreshold: number;
    depthOfFieldEnabled: boolean;
    maxBlur: number;
    sweepIntensity: number;
  };
  kind: "keld.scene.tuning";
  lights: LightTuning[];
  materials: {
    basalt: MaterialTuning;
    graphite: MaterialTuning;
    titanium: MaterialTuning;
  };
  objects: {
    lower: Vec3;
    slab: Vec3;
    upper: Vec3;
  };
  shadows: {
    bias: number;
    enabled: boolean;
    mapSize: 512 | 1024 | 2048;
    normalBias: number;
    opacity: number;
    radius: number;
  };
  stone: StoneTuning;
  version: 1;
};

export type StoneTuning = {
  id: StoneMaterialId;
  normalStrength: number;
  tiling: number;
  tint: string;
};

export type Vec3 = [number, number, number];
