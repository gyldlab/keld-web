import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

/** Smooth final display-space edges after depth-aware fog composition. */
export function createAntialiasPass() {
  const pass = new ShaderPass(FXAAShader);
  pass.setSize = (width: number, height: number) => {
    pass.uniforms.resolution.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  };
  return pass;
}
