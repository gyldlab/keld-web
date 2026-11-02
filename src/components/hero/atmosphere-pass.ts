import {
  Color,
  Data3DTexture,
  DepthTexture,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  NearestFilter,
  NoBlending,
  type PerspectiveCamera,
  RedFormat,
  RepeatWrapping,
  type Scene,
  ShaderMaterial,
  type SpotLight,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";

import type { MovingFogTuning } from "@/components/hero/_types/scene-preset";
import {
  atmosphereCompositeShader,
  atmosphereFogShader,
  atmosphereVertexShader,
} from "@/components/hero/atmosphere-shaders";
import { FogRevealFlow } from "@/components/hero/fog-reveal-flow";

export const DEFAULT_ATMOSPHERE: Readonly<MovingFogTuning> = Object.freeze({
  color: "#8eabc5",
  cursorStrength: 1,
  density: 0.065,
  speed: 1,
});

/** Deterministic, tileable 32 KiB density field; no third-party bitmap download. */
function createDensityTexture() {
  const size = 32;
  const bytes = new Uint8Array(size ** 3);
  const smooth = (x: number) => x * x * (3 - 2 * x);
  const hash = (x: number, y: number, z: number, n: number) => {
    let v = (((x % n) + n) % n) * 374761393;
    v = (v + (((y % n) + n) % n) * 668265263 + (((z % n) + n) % n) * 1442695041) | 0;
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
  };
  function lattice(x: number, y: number, z: number, n: number) {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      iz = Math.floor(z);
    const fx = smooth(x - ix),
      fy = smooth(y - iy),
      fz = smooth(z - iz);
    let value = 0;
    for (let k = 0; k < 2; k++)
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++)
          value +=
            hash(ix + i, iy + j, iz + k, n) *
            (i ? fx : 1 - fx) *
            (j ? fy : 1 - fy) *
            (k ? fz : 1 - fz);
    return value;
  }
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const a = lattice(x / 8, y / 8, z / 8, 4);
        const b = lattice(x / 4, y / 4, z / 4, 8);
        bytes[x + size * (y + size * z)] = Math.round((a * 0.78 + b * 0.22) * 255);
      }
  const texture = new Data3DTexture(bytes, size, size, size);
  texture.format = RedFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/** Cached scene/depth + bounded low-resolution volumetric atmospheric pass. */
export class AtmospherePass extends Pass {
  private sceneTarget: WebGLRenderTarget;
  private fogTarget: WebGLRenderTarget;
  private noise = createDensityTexture();
  private revealFlow = new FogRevealFlow();
  private fogMaterial: ShaderMaterial;
  private compositeMaterial: ShaderMaterial;
  private quad: FullScreenQuad;
  private dirty = true;
  private compact = false;
  private quality = 1;
  private width = 1;
  private height = 1;
  private point = new Vector3(2.5, 3, -3);
  private pointerTarget = this.point.clone();
  private pointerPrevious = this.point.clone();
  private pointerVelocity = new Vector3();
  private pointerStrength = 0;
  private pointerActive = false;
  private flowSpeed = DEFAULT_ATMOSPHERE.speed;
  private cursorScale = DEFAULT_ATMOSPHERE.cursorStrength;
  sceneCaptures = 0;
  time = 0;

  constructor(
    private scene: Scene,
    private camera: PerspectiveCamera,
    private key?: SpotLight,
    samples = 2,
  ) {
    super();
    this.sceneTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples });
    this.sceneTarget.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    this.fogTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
    this.fogTarget.texture.minFilter = this.fogTarget.texture.magFilter = NearestFilter;
    this.fogMaterial = new ShaderMaterial({
      name: "KELDDepthAwareAtmosphere",
      glslVersion: GLSL3,
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFogShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        uDepth: { value: this.sceneTarget.depthTexture },
        uNoise: { value: this.noise },
        uShadow: { value: null },
        uShadowMatrix: { value: new Matrix4() },
        uInverseProjection: { value: camera.projectionMatrixInverse },
        uCameraWorld: { value: camera.matrixWorld },
        uEye: { value: camera.position },
        uRevealInverse: { value: this.revealFlow.inverseTransforms },
        uRevealWeights: { value: this.revealFlow.weights },
        uVolumeMin: { value: this.revealFlow.boundsMin },
        uVolumeMax: { value: this.revealFlow.boundsMax },
        uNearFar: { value: new Vector2(camera.near, camera.far) },
        uFogSize: { value: new Vector2(1, 1) },
        uLightPosition: { value: new Vector3(5.73, 6, -12.199) },
        uLightDirection: { value: new Vector3() },
        uLightColor: { value: new Color("#c3ddfa") },
        uFogColor: { value: new Color(DEFAULT_ATMOSPHERE.color) },
        uDensity: { value: DEFAULT_ATMOSPHERE.density },
        uLightIntensity: { value: 0 },
        uLightAngle: { value: 0.48 },
        uHasShadow: { value: 0 },
        uPointer: { value: this.point },
        uPointerVelocity: { value: this.pointerVelocity },
        uPointerStrength: { value: 0 },
        uTime: { value: 0 },
        uReveal: { value: 1 },
        uSteps: { value: 24 },
      },
    });
    this.compositeMaterial = new ShaderMaterial({
      name: "KELDAtmosphereComposite",
      glslVersion: GLSL3,
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereCompositeShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        ...this.fogMaterial.uniforms,
        uScene: { value: this.sceneTarget.texture },
        uFog: { value: this.fogTarget.texture },
      },
    });
    this.quad = new FullScreenQuad(this.fogMaterial);
  }

  invalidate() {
    this.dirty = true;
  }
  configure(values: MovingFogTuning) {
    this.fogMaterial.uniforms.uFogColor.value.set(values.color);
    this.fogMaterial.uniforms.uDensity.value = values.density;
    this.flowSpeed = values.speed;
    this.cursorScale = values.cursorStrength;
  }
  setReveal(value: number) {
    this.fogMaterial.uniforms.uReveal.value = value;
    this.revealFlow.update(value);
    const intro = value < 0.9;
    this.fogMaterial.uniforms.uSteps.value =
      this.quality < 1 ? (intro ? 20 : 12) : this.compact ? (intro ? 32 : 16) : intro ? 48 : 24;
  }
  setRevealView(position: readonly number[]) {
    this.revealFlow.setView(position);
  }
  setCompact(value: boolean) {
    if (value === this.compact) return;
    this.compact = value;
    this.setSize(this.width, this.height);
  }
  lowerQuality() {
    if (this.quality <= 0.6) return false;
    this.quality = 0.6;
    this.setSize(this.width, this.height);
    return true;
  }
  getQuality() {
    return this.quality;
  }
  getPointerStrength() {
    return this.pointerStrength;
  }
  getFogSize() {
    return `${this.fogTarget.width}x${this.fogTarget.height}`;
  }

  setPointer(x: number, y: number, active: boolean) {
    this.pointerActive = active;
    if (!active) return;
    const ray = new Vector3(x, y, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const distance = Math.abs(ray.z) > 0.0001 ? (-3 - this.camera.position.z) / ray.z : 0;
    this.pointerTarget.copy(this.camera.position).addScaledVector(ray, Math.max(0, distance));
    this.pointerTarget.x = Math.max(-6, Math.min(10, this.pointerTarget.x));
    this.pointerTarget.y = Math.max(0, Math.min(6, this.pointerTarget.y));
    this.pointerStrength = Math.min(1, this.pointerStrength + 0.25);
  }

  advance(delta: number) {
    const dt = Math.min(delta, 0.1);
    this.time += dt * this.flowSpeed;
    this.pointerPrevious.copy(this.point);
    this.point.lerp(this.pointerTarget, 1 - Math.exp(-dt * 7));
    this.pointerVelocity
      .subVectors(this.point, this.pointerPrevious)
      .divideScalar(Math.max(dt, 0.001))
      .clampLength(0, 3);
    this.pointerStrength *= Math.exp(-dt * (this.pointerActive ? 1.3 : 3.0));
    this.fogMaterial.uniforms.uPointerStrength.value = this.pointerStrength * this.cursorScale;
    this.fogMaterial.uniforms.uTime.value = this.time;
  }

  setSize(width: number, height: number) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.sceneTarget.setSize(this.width, this.height);
    const maxWidth = this.compact ? 360 : 840;
    const scale = Math.min(this.compact ? 0.5 : 0.45, maxWidth / this.width) * this.quality;
    const w = Math.max(1, Math.round(this.width * scale)),
      h = Math.max(1, Math.round(this.height * scale));
    this.fogTarget.setSize(w, h);
    this.compositeMaterial.uniforms.uFogSize.value.set(w, h);
    this.setReveal(this.fogMaterial.uniforms.uReveal.value);
    this.dirty = true;
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget) {
    const oldTarget = renderer.getRenderTarget();
    const oldAutoClear = renderer.autoClear;
    try {
      if (this.dirty) {
        renderer.autoClear = true;
        renderer.setRenderTarget(this.sceneTarget);
        renderer.render(this.scene, this.camera);
        this.sceneCaptures++;
        this.dirty = false;
      }
      const u = this.fogMaterial.uniforms;
      u.uNearFar.value.set(this.camera.near, this.camera.far);
      const light = this.key;
      if (light) {
        u.uLightPosition.value.copy(light.position);
        u.uLightDirection.value.subVectors(light.target.position, light.position).normalize();
        u.uLightColor.value.copy(light.color);
        u.uLightIntensity.value = light.visible ? light.intensity : 0;
        u.uLightAngle.value = light.angle;
        u.uShadow.value = light.shadow.map?.depthTexture ?? null;
        u.uShadowMatrix.value.copy(light.shadow.matrix);
        u.uHasShadow.value = light.castShadow && light.shadow.map?.depthTexture ? 1 : 0;
      }
      this.quad.material = this.fogMaterial;
      renderer.setRenderTarget(this.fogTarget);
      this.quad.render(renderer);
      this.quad.material = this.compositeMaterial;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.quad.render(renderer);
    } finally {
      renderer.autoClear = oldAutoClear;
      renderer.setRenderTarget(oldTarget);
    }
  }

  dispose() {
    this.sceneTarget.dispose();
    this.fogTarget.dispose();
    this.noise.dispose();
    this.fogMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.dispose();
  }
}
