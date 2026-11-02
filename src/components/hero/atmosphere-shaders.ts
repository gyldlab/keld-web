export const atmosphereVertexShader = `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Both resolutions integrate the same volume. Silhouette pixels use their own
// opaque depth rather than borrowing a low-resolution background fog sample.
const integration = `
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
  uniform vec2 uFogSize;
  uniform float uPointerStrength;
  uniform float uTime;
  uniform float uReveal;
  uniform float uDensity;
  uniform float uLightIntensity;
  uniform float uLightAngle;
  uniform float uHasShadow;
  uniform int uSteps;

  vec3 worldAt(vec2 coord, float depth) {
    vec4 p = uCameraWorld * uInverseProjection * vec4(coord * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }

  float densityAt(vec3 p) {
    float edges = smoothstep(-8.0, -5.0, p.x) * (1.0 - smoothstep(9.0, 12.0, p.x));
    edges *= smoothstep(-12.0, -9.0, p.z) * (1.0 - smoothstep(0.0, 1.2, p.z));
    float height = smoothstep(0.0, 1.3, p.y) * (1.0 - smoothstep(2.0, 6.5, p.y));
    vec3 delta = p - uPointer;
    float influence = exp(-dot(delta, delta) * 0.28) * uPointerStrength;
    vec3 curl = vec3(-delta.y, delta.x, delta.z * 0.12);
    vec3 flow = (curl * 0.4 + uPointerVelocity * 0.16) * influence;
    vec3 q = (p + flow) * vec3(0.105, 0.18, 0.10);
    // Visible advection at speed=1, including previously saved editor drafts.
    // Two differently moving scales keep the volume from sliding as one card.
    q += vec3(-uTime * 0.021, uTime * 0.0054, uTime * 0.0072);
    float broad = texture(uNoise, q).r;
    float detail = texture(uNoise, q * 2.63 + vec3(0.31, 0.13, -uTime * 0.009)).r;
    float wisps = smoothstep(0.30, 0.73, broad * 0.76 + detail * 0.24);
    float revealVeil = mix(1.65, 1.0, uReveal);
    float ambient = edges * height * wisps * uDensity * revealVeil * (1.0 - influence * 0.38);
    if (uReveal >= 0.82) return ambient;
    // A temporary foreground plume parts rapidly around the assembling mark.
    // It reaches exactly zero, leaving the normal rear atmosphere untouched.
    float opening = smoothstep(0.12, 0.58, uReveal);
    float veil = 1.0 - smoothstep(0.38, 0.82, uReveal);
    vec3 relative = p - vec3(2.55, 2.7, 1.6);
    vec3 envelope = relative * vec3(0.27, 0.46, 0.56);
    float plume = exp(-dot(envelope, envelope)) * smoothstep(0.55, 1.35, p.z);
    vec3 rush = vec3(sign(relative.x) * opening * 2.2, opening * 0.65, opening * 0.8);
    float plumeNoise = texture(uNoise, (p - rush) * vec3(0.24, 0.3, 0.26)).r;
    float split = abs(relative.x + relative.y * 0.24) + (plumeNoise - 0.5) * 1.5;
    float clearing = smoothstep(opening * 3.4 - 0.45, opening * 3.4 + 0.85, split);
    clearing = mix(1.0, clearing, smoothstep(0.0, 0.18, opening));
    float plumeWisps = smoothstep(0.24, 0.76, plumeNoise);
    float foreground = plume * clearing * veil * (0.25 + plumeWisps * 1.4) * uDensity * 18.0;
    return ambient + foreground;
  }

  float visibilityAt(vec3 p) {
    if (uHasShadow < 0.5) return 1.0;
    vec4 sc = uShadowMatrix * vec4(p, 1.0);
    vec3 s = sc.xyz / sc.w;
    if (min(s.x, s.y) < 0.0 || max(s.x, s.y) > 1.0 || s.z > 1.0 || s.z < 0.0) return 0.0;
    return texture(uShadow, vec3(s.xy, s.z - 0.0008));
  }

  vec4 fogAt(vec2 coord, float rawDepth) {
    vec3 surface = worldAt(coord, rawDepth);
    vec3 ray = normalize(surface - uEye);
    float opaqueDistance = length(surface - uEye);
    vec3 safeRay = mix(vec3(0.00001), ray, step(vec3(0.00001), abs(ray)));
    vec3 a = (vec3(-8.0, 0.0, -12.0) - uEye) / safeRay;
    float front = mix(4.8, 1.2, smoothstep(0.38, 0.82, uReveal));
    vec3 b = (vec3(12.0, 6.5, front) - uEye) / safeRay;
    vec3 lo = min(a, b), hi = max(a, b);
    float entry = max(0.0, max(lo.x, max(lo.y, lo.z)));
    float end = min(opaqueDistance, min(hi.x, min(hi.y, hi.z)));
    if (end <= entry) return vec4(0.0, 0.0, 0.0, 1.0);
    float stepSize = (end - entry) / float(uSteps);
    // One stable sampling grid for both passes: no temporal speckle or history.
    vec2 seed = floor(coord * uFogSize) + 0.5;
    float jitter = fract(52.9829189 * fract(dot(seed, vec2(0.06711056, 0.00583715))));
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
    return vec4(light, transmission);
  }
`;

export const atmosphereFogShader = `
  ${integration}
  in vec2 vUv;
  out vec4 fragColor;
  void main() {
    fragColor = fogAt(vUv, texture(uDepth, vUv).r);
  }
`;

export const atmosphereCompositeShader = `
  ${integration}
  uniform sampler2D uScene;
  uniform sampler2D uFog;
  in vec2 vUv;
  out vec4 fragColor;
  float viewDepth(float d) {
    return (2.0 * uNearFar.x * uNearFar.y) /
      (uNearFar.y + uNearFar.x - (d * 2.0 - 1.0) * (uNearFar.y - uNearFar.x));
  }
  void main() {
    vec4 scene = texture(uScene, vUv);
    float rawDepth = texture(uDepth, vUv).r;
    float depth = viewDepth(rawDepth);
    vec2 grid = vUv * uFogSize - 0.5;
    vec2 base = floor(grid), f = fract(grid);
    vec4 fog = vec4(0.0);
    float nearestDifference = 1e6, minimumDepth = 1e6, maximumDepth = 0.0;
    float weights = 0.0;
    for (int y = 0; y < 2; y++) {
      for (int x = 0; x < 2; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 coord = (base + offset + 0.5) / uFogSize;
        vec4 sampleFog = texture(uFog, coord);
        vec2 bilinear = mix(1.0 - f, f, offset);
        float sampleDepth = viewDepth(texture(uDepth, coord).r);
        float difference = abs(sampleDepth - depth);
        nearestDifference = min(nearestDifference, difference);
        minimumDepth = min(minimumDepth, sampleDepth);
        maximumDepth = max(maximumDepth, sampleDepth);
        float weight = bilinear.x * bilinear.y * exp(-difference * 12.0);
        fog += sampleFog * weight;
        weights += weight;
      }
    }
    float tolerance = max(0.08, depth * 0.01);
    bool boundary = maximumDepth - minimumDepth > tolerance || nearestDifference > tolerance;
    if (boundary || weights <= 0.0001) fog = fogAt(vUv, rawDepth);
    else fog /= weights;
    // Linear-light composition before the single OutputPass and final FXAA.
    fragColor = vec4(scene.rgb * fog.a + fog.rgb, scene.a);
  }
`;
