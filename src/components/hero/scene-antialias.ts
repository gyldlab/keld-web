import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

/** Keep small-screen geometry crisp without allocating tablet-sized DPR-2 buffers. */
export function scenePixelRatio(width: number, height: number, compact: boolean) {
  const ratio = Math.min(window.devicePixelRatio || 1, compact ? 2 : 1.5);
  return compact ? Math.min(ratio, Math.sqrt(1_500_000 / Math.max(1, width * height))) : ratio;
}

/** Smooth final display-space edges after depth-aware fog composition. */
export function createAntialiasPass() {
  const pass = new ShaderPass(FXAAShader);
  pass.setSize = (width: number, height: number) => {
    pass.uniforms.resolution.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  };
  return pass;
}
