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

export const DEFAULT_ATMOSPHERE: Readonly<MovingFogTuning> = Object.freeze({
  color: "#8eabc5",
  cursorStrength: 1,
  density: 0.065,
  speed: 1,
});

// Design references and limits: docs/hero-atmosphere.md. No path tracing,
// simulation download, temporal history, or per-frame scene reflection capture.
const vertexShader = `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fogShader = `
  precision highp sampler3D;
  precision highp sampler2DShadow;
  uniform sampler2D uDepth;
  uniform sampler3D uNoise;
  uniform sampler2DShadow uShadow;
  uniform mat4 uInverseProjection;
  uniform mat4 uCameraWorld;
  uniform mat4 uShadowMatrix;
  uniform vec3 uEye;
  uniform vec3 uLightPosition;
  uniform vec3 uLightDirection;
  uniform vec3 uLightColor;
  uniform vec3 uFogColor;
  uniform vec3 uPointer;
  uniform vec3 uPointerVelocity;
  uniform vec2 uNearFar;
  uniform float uPointerStrength;
  uniform float uTime;
  uniform float uReveal;
  uniform float uDensity;
  uniform float uLightIntensity;
  uniform float uLightAngle;
  uniform float uHasShadow;
  uniform int uSteps;
  in vec2 vUv;
  out vec4 fragColor;

  vec3 worldAt(float depth) {
    vec4 p = uCameraWorld * uInverseProjection * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }

  float densityAt(vec3 p) {
    // A soft, bounded volume behind the sculpture; no rectangular card edges.
    float edges = smoothstep(-8.0, -5.0, p.x) * (1.0 - smoothstep(9.0, 12.0, p.x));
    edges *= smoothstep(-12.0, -9.0, p.z) * (1.0 - smoothstep(0.0, 1.2, p.z));
    float height = smoothstep(0.0, 1.3, p.y) * (1.0 - smoothstep(2.0, 6.5, p.y));
    vec3 delta = p - uPointer;
    float influence = exp(-dot(delta, delta) * 0.28) * uPointerStrength;
    vec3 curl = vec3(-delta.y, delta.x, delta.z * 0.12);
    vec3 flow = (curl * 0.4 + uPointerVelocity * 0.16) * influence;
    vec3 q = (p + flow) * vec3(0.105, 0.18, 0.10);
    q += vec3(-uTime * 0.007, uTime * 0.0018, uTime * 0.0024);
    float broad = texture(uNoise, q).r;
    float detail = texture(uNoise, q * 2.63 + vec3(0.31, 0.13, -uTime * 0.003)).r;
    float wisps = smoothstep(0.30, 0.73, broad * 0.76 + detail * 0.24);
    float revealVeil = mix(1.65, 1.0, uReveal);
    return edges * height * wisps * uDensity * revealVeil * (1.0 - influence * 0.38);
  }

  float visibilityAt(vec3 p) {
    if (uHasShadow < 0.5) return 1.0;
    vec4 sc = uShadowMatrix * vec4(p, 1.0);
    vec3 s = sc.xyz / sc.w;
    if (min(s.x, s.y) < 0.0 || max(s.x, s.y) > 1.0 || s.z > 1.0 || s.z < 0.0) return 0.0;
    return texture(uShadow, vec3(s.xy, s.z - 0.0008));
  }

  void main() {
    float rawDepth = texture(uDepth, vUv).r;
    vec3 surface = worldAt(rawDepth);
    vec3 ray = normalize(surface - uEye);
    float opaqueDistance = length(surface - uEye);
    vec3 safeRay = mix(vec3(0.00001), ray, step(vec3(0.00001), abs(ray)));
    vec3 a = (vec3(-8.0, 0.0, -12.0) - uEye) / safeRay;
    vec3 b = (vec3(12.0, 6.5, 1.2) - uEye) / safeRay;
    vec3 lo = min(a, b), hi = max(a, b);
    float entry = max(0.0, max(lo.x, max(lo.y, lo.z)));
    float end = min(opaqueDistance, min(hi.x, min(hi.y, hi.z)));
    if (end <= entry) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    float stepSize = (end - entry) / float(uSteps);
    // Fixed sub-step offset: no temporal speckle, no accumulated ghost images.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float t = entry + stepSize * (0.25 + 0.5 * jitter);
    float transmission = 1.0;
    vec3 light = vec3(0.0);
    for (int i = 0; i < 32; i++) {
      if (i >= uSteps || t >= end || transmission < 0.02) break;
      vec3 p = uEye + ray * t;
      float density = densityAt(p);
      float extinction = 1.0 - exp(-density * stepSize);
      vec3 fromLight = p - uLightPosition;
      float distanceSquared = max(dot(fromLight, fromLight), 10.0);
      float cone = dot(normalize(fromLight), uLightDirection);
      float beam = smoothstep(cos(uLightAngle), cos(uLightAngle * 0.65), cone);
      float illumination = beam * visibilityAt(p) * min(2.5, uLightIntensity * 0.16 / distanceSquared);
      vec3 scattering = uFogColor * 0.25 + uLightColor * illumination;
      light += transmission * extinction * scattering;
      transmission *= 1.0 - extinction;
      t += stepSize;
    }
    // Premultiplied scattered radiance and Beer-Lambert transmittance.
    fragColor = vec4(light, transmission);
  }
`;

const compositeShader = `
  uniform sampler2D uScene;
  uniform sampler2D uFog;
  uniform sampler2D uDepth;
  uniform vec2 uFogSize;
  uniform vec2 uNearFar;
  in vec2 vUv;
  out vec4 fragColor;
  float viewDepth(float d) {
    return (2.0 * uNearFar.x * uNearFar.y) /
      (uNearFar.y + uNearFar.x - (d * 2.0 - 1.0) * (uNearFar.y - uNearFar.x));
  }
  void main() {
    vec4 scene = texture(uScene, vUv);
    float depth = viewDepth(texture(uDepth, vUv).r);
    vec2 grid = vUv * uFogSize - 0.5;
    vec2 base = floor(grid), f = fract(grid);
    vec4 fog = vec4(0.0);
    vec4 nearestFog = vec4(0.0, 0.0, 0.0, 1.0);
    float nearestDifference = 1e6;
    float weights = 0.0;
    for (int y = 0; y < 2; y++) {
      for (int x = 0; x < 2; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 coord = (base + offset + 0.5) / uFogSize;
        vec4 sampleFog = texture(uFog, coord);
        vec2 bilinear = mix(1.0 - f, f, offset);
        float sampleDepth = viewDepth(texture(uDepth, coord).r);
        float difference = abs(sampleDepth - depth);
        if (difference < nearestDifference) { nearestDifference = difference; nearestFog = sampleFog; }
        float weight = bilinear.x * bilinear.y * exp(-difference * 12.0);
        fog += sampleFog * weight;
        weights += weight;
      }
    }
    fog = weights > 0.0001 ? fog / weights : nearestFog;
    // Composite in linear light, before the existing single OutputPass.
    fragColor = vec4(scene.rgb * fog.a + fog.rgb, scene.a);
  }
`;

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
      vertexShader,
      fragmentShader: fogShader,
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
        uNearFar: { value: new Vector2(camera.near, camera.far) },
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
      vertexShader,
      fragmentShader: compositeShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        uScene: { value: this.sceneTarget.texture },
        uFog: { value: this.fogTarget.texture },
        uDepth: { value: this.sceneTarget.depthTexture },
        uFogSize: { value: new Vector2(1, 1) },
        uNearFar: { value: this.fogMaterial.uniforms.uNearFar.value },
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
    this.fogMaterial.uniforms.uSteps.value = this.quality < 1 ? 12 : this.compact ? 16 : 24;
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
