import type { ScenePreset, StoneTuning, Vec3 } from "@/components/hero/_types/scene-preset";

export type CameraSpec = {
  far?: number;
  fov: number;
  near?: number;
  position: Vec3;
  target: Vec3;
};
export type LightSpec = {
  angle?: number;
  color: string;
  decay?: number;
  distance?: number;
  height: number;
  intensity: number;
  name: string;
  penumbra?: number;
  position: Vec3;
  target: Vec3;
  type: "area" | "spot";
  width: number;
};
export type SceneConfig = {
  animation: string;
  areaIntensityScale?: number;
  background: string;
  cameras: { desktop: CameraSpec; mobile: CameraSpec };
  depthOfField?: {
    aperture: number;
    desktopOnly: boolean;
    maxBlur: number;
    target: Vec3;
  };
  durationSeconds: number;
  environmentIntensity?: number;
  exposure: number;
  finishSweep?: {
    end: number;
    from: Vec3;
    height: number;
    intensity: number;
    start: number;
    target: Vec3;
    to: Vec3;
    width: number;
  };
  fog?: { color: string; density: number };
  hemisphereIntensity?: number;
  lights: LightSpec[];
  reflection: {
    depth: number;
    enabled?: boolean;
    position: Vec3;
    width: number;
  };
  renderMode?: "pathtraced" | "raster";
  revision?: string;
  stone?: StoneTuning;
  version: 1;
  volume?: { position: Vec3; size: Vec3 };
};

export type SceneController = {
  applyTuning(preset: unknown): Promise<boolean>;
  cancelCapture?(): void;
  capturePoster(mode: "desktop" | "mobile"): string | Promise<string>;
  dispose(): void;
  getDefaultTuning(): ScenePreset | null;
  getDenoising?(): boolean;
  getMotion?(): boolean;
  getSampleBudget?(): number;
  getTuning(): ScenePreset | null;
  pause(): void;
  play(): void;
  renderMode?: "pathtraced" | "raster";
  replay(): void;
  seek(progress: number): void;
  setDenoising?(value: boolean): void;
  setEnergy(value: boolean): void;
  setMotion?(value: boolean): void;
  setSampleBudget?(value: number): void;
  setVisible(value: boolean): void;
};

export type SceneRuntimeOptions = {
  editor?: boolean;
  onFailure(): void;
  onMotionChange?: (enabled: boolean) => void;
  onPlaying(value: boolean): void;
  onProgress?(value: number): void;
  onTuningChange?: (preset: ScenePreset) => void;
  restoreTuning?: (defaults: ScenePreset) => unknown;
  signal: AbortSignal;
  socialHost?: HTMLElement;
};
