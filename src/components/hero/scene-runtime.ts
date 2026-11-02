import {
  AgXToneMapping,
  type AnimationAction,
  AnimationMixer,
  Color,
  FogExp2,
  HalfFloatType,
  HemisphereLight,
  LoopOnce,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  RectAreaLight,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Reflector } from "three/addons/objects/Reflector.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import type { SceneController, SceneRuntimeOptions } from "@/components/hero/_types/scene-runtime";
import { AtmospherePass } from "@/components/hero/atmosphere-pass";
import { createDeckReflection } from "@/components/hero/deck-reflection";
import type { SceneTuner } from "@/components/hero/editor/scene-bindings";
import type { Vec3 } from "@/components/hero/editor/scene-preset";
import { createAntialiasPass, scenePixelRatio } from "@/components/hero/scene-antialias";
import { HERO_ASSET_ROOT, HERO_COMPACT_QUERY } from "@/components/hero/scene-assets";
import { frameSceneCamera } from "@/components/hero/scene-camera";
import { readConfig, reflectionSignature } from "@/components/hero/scene-config";
import { createSceneMotion } from "@/components/hero/scene-motion";
import { disposeModel, projectSocialLinks } from "@/components/hero/scene-resources";
import { createSocialPlinths } from "@/components/hero/social-plinths";
export type { SceneConfig, SceneController } from "@/components/hero/_types/scene-runtime";

export async function createScene(
  host: HTMLElement,
  options: SceneRuntimeOptions,
): Promise<SceneController> {
  const { signal, onPlaying, onProgress, onFailure } = options;
  signal.throwIfAborted();
  const root = HERO_ASSET_ROOT;
  const [configResponse, modelResponse] = await Promise.all([
    fetch(`${root}realtime-config.json`, { signal }),
    fetch(`${root}keld-hero.glb`, { signal }),
  ]);
  if (!configResponse.ok || !modelResponse.ok)
    throw new Error("Cinematic assets could not be loaded.");
  const [rawConfig, buffer] = await Promise.all([
    configResponse.json(),
    modelResponse.arrayBuffer(),
  ]);
  signal.throwIfAborted();
  const config = readConfig(rawConfig);
  let gltf: GLTF | undefined;
  let renderer: WebGLRenderer | undefined;
  let composer: EffectComposer | undefined;
  let atmosphere: AtmospherePass | undefined;
  let antialias: ReturnType<typeof createAntialiasPass> | undefined;
  let socials: Awaited<ReturnType<typeof createSocialPlinths>> | undefined;
  let bloom: UnrealBloomPass | undefined;
  let output: OutputPass | undefined;
  let defocus: BokehPass | undefined;
  let dofTargetSize: { width: number; height: number } | undefined;
  let tuner: SceneTuner | undefined;
  let orbit: OrbitControls | undefined;
  let syncingOrbit = false;
  let environment: WebGLRenderTarget | undefined;
  let reflectionGenerator: PMREMGenerator | undefined;
  let reflectionTimer: ReturnType<typeof setTimeout> | undefined;
  let reflector: Reflector | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let mixer: AnimationMixer | undefined;
  let disposed = false;
  let visible = true;
  let playing = false;
  let elapsed = 0;
  let reportedProgress = -1;
  let energy = true;
  let shaderFailed = false;
  let cameraEdited = false;
  let viewportWidth = 0;
  let viewportHeight = 0;
  let drawCount = 0;
  let reflectionCount = 0;
  let reflectionDirty = false;
  let settleScene: (() => void) | undefined;
  let advanceScene: ((delta: number) => void) | undefined;
  let drawScene: ((changed: boolean) => void) | undefined;
  const motion = createSceneMotion(host, {
    atmosphere: () => atmosphere,
    isPlaying: () => playing,
    advanceAnimation: (delta) => advanceScene?.(delta),
    draw: (changed) => drawScene?.(changed),
    enabledChanged: (enabled) => {
      options.onMotionChange?.(enabled);
      if (!enabled) {
        playing = false;
        settleScene?.();
        onPlaying(false);
      }
    },
  });
  const actions: AnimationAction[] = [];
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  const disposableLights: SpotLight[] = [];
  const liveLights: Array<RectAreaLight | SpotLight> = [];

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    motion.dispose();
    clearTimeout(reflectionTimer);
    resizeObserver?.disconnect();
    projectSocialLinks(options.socialHost, socials?.anchors, camera, 0, 0, false);
    socials?.dispose();
    atmosphere?.dispose();
    antialias?.dispose();
    renderer?.domElement.removeEventListener("webglcontextlost", contextLost);
    signal.removeEventListener("abort", dispose);
    orbit?.dispose();
    tuner?.dispose();
    mixer?.stopAllAction();
    if (gltf) {
      mixer?.uncacheRoot(gltf.scene);
      disposeModel(gltf.scene);
    }
    // Reflector owns its offscreen target and must release it explicitly.
    reflector?.dispose();
    reflector?.geometry.dispose();
    environment?.dispose();
    reflectionGenerator?.dispose();
    disposableLights.forEach((light) => light.dispose());
    bloom?.dispose();
    defocus?.dispose();
    output?.dispose();
    composer?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
  };

  function contextLost(event: Event) {
    event.preventDefault();
    playing = false;
    onPlaying(false);
    onFailure();
    dispose();
  }

  try {
    gltf = await new GLTFLoader().parseAsync(buffer, root);
    // parseAsync cannot be cancelled; its late result is still disposed on abort.
    signal.throwIfAborted();
    const clip = gltf.animations.find((candidate) => candidate.name === config.animation);
    if (!clip || Math.abs(clip.duration - config.durationSeconds) > 0.04)
      throw new Error("Missing or unexpected Blender animation clip.");
    scene.background = new Color(config.background);
    if (config.fog) scene.fog = new FogExp2(config.fog.color, config.fog.density);
    scene.add(gltf.scene);

    const atmosphereMeshes: Mesh[] = [];
    gltf.scene.traverse((object) => {
      if (object instanceof Mesh) {
        // Multi-material glTF nodes are Groups; children keep mesh names, not node names.
        let ancestor: Object3D | null = object;
        let isLogo = false;
        while (ancestor) {
          if (ancestor.name === "LogoUpper" || ancestor.name === "LogoLower") isLogo = true;
          ancestor = ancestor.parent;
        }
        object.castShadow = isLogo || object.name !== "BlueDaylightAperture";
        object.receiveShadow = true;
        // Materials and geometry come from the asset, not a rebuilt silhouette.
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material instanceof MeshStandardMaterial) {
            material.envMapIntensity = material.name === "KELD Titanium" ? 1.0 : 0.5;
          }
          // The soft atmospheric veil must not occlude the architecture behind it.
          if (material.name === "Aperture Mist") {
            material.depthWrite = false;
            object.castShadow = false;
            object.receiveShadow = false;
            if (!atmosphereMeshes.includes(object)) atmosphereMeshes.push(object);
          }
        }
      }
      // Camera/area-light positions are supplied by the matching asset manifest.
      if (object.type.endsWith("Light")) object.visible = false;
    });

    renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = AgXToneMapping;
    renderer.toneMappingExposure = config.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    host.dataset.renderMode = "raster";
    renderer.debug.onShaderError = (gl, _program, vertex, fragment) => {
      shaderFailed = true;
      console.error(
        "KELD shader compilation failed.",
        gl.getShaderInfoLog(vertex),
        gl.getShaderInfoLog(fragment),
      );
    };
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    host.appendChild(renderer.domElement);
    socials = await createSocialPlinths(gltf.scene, signal);
    signal.throwIfAborted();

    scene.environmentIntensity = config.environmentIntensity ?? 0.18;
    const hemisphere = new HemisphereLight(0xabc8e0, 0x12141b, config.hemisphereIntensity ?? 0.12);
    scene.add(hemisphere);
    RectAreaLightUniformsLib.init();

    for (const spec of config.lights) {
      if (spec.type === "area") {
        // Browser luminance is calibrated separately from Blender's watt units.
        const light = new RectAreaLight(
          spec.color,
          spec.intensity * (config.areaIntensityScale ?? 0.35),
          spec.width,
          spec.height,
        );
        light.name = spec.name;
        light.position.fromArray(spec.position);
        light.lookAt(...spec.target);
        scene.add(light);
        liveLights.push(light);
      } else {
        const light = new SpotLight(
          spec.color,
          spec.intensity,
          spec.distance ?? 45,
          spec.angle ?? Math.PI / 5,
          spec.penumbra ?? 0.65,
          spec.decay ?? 2,
        );
        light.name = spec.name;
        light.position.fromArray(spec.position);
        light.target.position.fromArray(spec.target);
        light.castShadow = true;
        const shadowSize = matchMedia(HERO_COMPACT_QUERY).matches ? 1024 : 2048;
        light.shadow.mapSize.set(shadowSize, shadowSize);
        light.shadow.bias = -0.00015;
        light.shadow.normalBias = 0.002;
        light.shadow.radius = 3;
        light.shadow.intensity = 1;
        light.shadow.camera.near = 0.1;
        light.shadow.camera.far = 60;
        // Bounded PCF filtering on one key light. VSM made every receiver a
        // caster and produced visible bands in this particular enclosed scene.
        // https://threejs.org/docs/pages/LightShadow.html
        scene.add(light, light.target);
        disposableLights.push(light);
        liveLights.push(light);
      }
    }

    const windowLight = liveLights.find((light) => light.name === "WindowEmitter");
    const aperture = gltf.scene.getObjectByName("BlueDaylightAperture");
    const apertureOrigin = aperture?.position.clone();
    const lightOrigin = windowLight?.position.clone();
    const windowIntensity = Math.max(windowLight?.intensity ?? 1, 0.001);
    function syncWindowSource() {
      if (!aperture || !apertureOrigin || !windowLight || !lightOrigin) return;
      aperture.position.copy(apertureOrigin).add(windowLight.position).sub(lightOrigin);
      aperture.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          if (material instanceof MeshStandardMaterial) {
            material.emissive.copy(windowLight.color);
            material.emissiveIntensity = windowLight.visible
              ? (4 * windowLight.intensity) / windowIntensity
              : 0;
          }
        }
      });
    }

    // A rough basalt slab must not inherit the previous scene's satin mirror.
    // RectAreaLight does not cast shadows: the authored spot owns contact shadows.
    // https://threejs.org/docs/pages/RectAreaLight.html
    reflector = createDeckReflection(config.reflection);
    if (reflector) scene.add(reflector);

    // The rear accent remains on after the model settles, so the backlight
    // does not disappear at the end of loading.
    // https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html
    const sweepSpec = config.finishSweep;
    const finishLight = sweepSpec
      ? new RectAreaLight(0xc4dfff, sweepSpec.intensity, sweepSpec.width, sweepSpec.height)
      : undefined;
    if (finishLight) {
      finishLight.name = "KELDFinishSweep";
      finishLight.position.fromArray(sweepSpec!.to);
      finishLight.lookAt(...sweepSpec!.target);
      scene.add(finishLight);
    }

    // Capture the real distant opening and illuminated stone from the logo's
    // position. A generic studio environment gave unrelated gray reflections.
    reflectionGenerator = new PMREMGenerator(renderer);
    const reflectionSubjects = [
      gltf.scene.getObjectByName("LogoUpper"),
      gltf.scene.getObjectByName("LogoLower"),
    ].filter((object): object is Object3D => !!object);
    const reflectionOrigin = new Vector3(2.45, 2.8, 0);
    function captureEnvironment() {
      if (disposed || !renderer || !reflectionGenerator) return;
      const previous = scene.environment;
      const visibility = reflectionSubjects.map((object) => object.visible);
      scene.environment = null;
      reflectionSubjects.forEach((object) => {
        object.visible = false;
      });
      let next: WebGLRenderTarget;
      try {
        scene.updateMatrixWorld(true);
        renderer.shadowMap.needsUpdate = true;
        next = reflectionGenerator.fromScene(scene, 0.025, 0.1, 100, {
          position: reflectionOrigin,
          size: 256,
        });
      } finally {
        reflectionSubjects.forEach((object, index) => {
          object.visible = visibility[index];
        });
        scene.environment = previous;
        renderer.shadowMap.needsUpdate = true;
      }
      const old = environment;
      environment = next;
      scene.environment = next.texture;
      old?.dispose();
      reflectionDirty = false;
      host.dataset.reflectionCaptures = String(++reflectionCount);
    }
    function scheduleReflectionUpdate() {
      clearTimeout(reflectionTimer);
      reflectionDirty = true;
      reflectionTimer = setTimeout(() => {
        if (disposed || !visible) return;
        try {
          captureEnvironment();
          draw();
        } catch (error) {
          // Keep the last valid reflection if an edit coincides with GPU loss.
          console.warn("KELD retained the previous scene reflection.", error);
        }
      }, 160);
    }

    // The atmosphere's cached scene target owns antialiasing and depth. The
    // full-screen postprocess buffers need neither duplicate MSAA nor depth.
    const renderTarget = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: false,
    });
    composer = new EffectComposer(renderer, renderTarget);
    atmosphere = new AtmospherePass(
      scene,
      camera,
      windowLight instanceof SpotLight ? windowLight : undefined,
      Math.min(4, renderer.capabilities.maxSamples),
    );
    composer.addPass(atmosphere);
    // Mild depth-aware background separation, not decorative bokeh circles.
    // Focus is camera-forward distance, NOT Euclidean distance or an f-stop.
    // https://threejs.org/docs/pages/BokehPass.html
    if (config.depthOfField) {
      defocus = new BokehPass(scene, camera, {
        focus: 12,
        aperture: config.depthOfField.aperture,
        maxblur: config.depthOfField.maxBlur,
      });
      defocus.enabled = config.depthOfField.maxBlur > 0;
      // Exclude legacy transparent mist cards from BokehPass's opaque depth override.
      const renderDefocus = defocus.render.bind(defocus);
      defocus.render = (...args) => {
        const visibility = atmosphereMeshes.map((mesh) => mesh.visible);
        atmosphereMeshes.forEach((mesh) => {
          mesh.visible = false;
        });
        try {
          renderDefocus(...args);
        } finally {
          atmosphereMeshes.forEach((mesh, index) => {
            mesh.visible = visibility[index];
          });
        }
      };
      composer.addPass(defocus);
    }
    // Static optical response only. Pulsing global bloom made the doorway,
    // rather than the mark, the brightest moving element in the first review.
    // https://threejs.org/docs/pages/UnrealBloomPass.html
    // The visible glow is the localized veil behind the mark; avoid adding a
    // screen-space halo to the foreground logo. The editor can still enable it.
    bloom = new UnrealBloomPass(new Vector2(1, 1), 0, 0.3, 2.5);
    bloom.enabled = false;
    composer.addPass(bloom);
    output = new OutputPass();
    composer.addPass(output);
    antialias = createAntialiasPass();
    composer.addPass(antialias);

    // The opt-in scene editor adds tuning wrappers and orbit controls. Source
    // meshes and animation clips remain owned by the imported glTF.
    // eslint-disable-next-line no-restricted-properties -- Build-time development-only branch.
    if (process.env.NODE_ENV === "development" && options.editor) {
      const { createSceneTuner } = await import("@/components/hero/editor/scene-bindings");
      tuner = createSceneTuner({
        atmospherePass: atmosphere,
        socials,
        source: config,
        scene,
        model: gltf,
        renderer,
        hemisphere,
        lights: liveLights,
        bloom,
        defocus,
      });
      const defaults = tuner.getDefaults();
      const saved = options.restoreTuning?.(defaults);
      try {
        await tuner.apply(saved ?? defaults);
      } catch {
        await tuner.apply(defaults);
      }
      signal.throwIfAborted();
      cameraEdited = JSON.stringify(tuner.get().camera) !== JSON.stringify(defaults.camera);
    }
    mixer = new AnimationMixer(gltf.scene);
    const action = mixer.clipAction(clip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    actions.push(action);

    function sample(seconds: number) {
      if (disposed || !mixer) return;
      // LoopOnce pauses at the end; explicitly unpause before seeking backwards.
      actions.forEach((entry) => {
        entry.paused = false;
        entry.enabled = true;
      });
      mixer.setTime(seconds);
      const reveal = Math.max(0, Math.min(1, seconds / config.durationSeconds));
      atmosphere?.setReveal(reveal);
      socials?.setReveal(reveal);
      if (!cameraEdited)
        updateCamera(
          Math.max(1, host.clientWidth),
          Math.max(1, host.clientHeight),
          matchMedia(HERO_COMPACT_QUERY).matches,
          reveal,
        );
      if (renderer) renderer.shadowMap.needsUpdate = true;
      if (finishLight && sweepSpec) {
        finishLight.position
          .set(...sweepSpec.from)
          .lerp({ x: sweepSpec.to[0], y: sweepSpec.to[1], z: sweepSpec.to[2] }, 0.8);
        finishLight.lookAt(...sweepSpec.target);
        finishLight.intensity = energy
          ? (tuner?.get().effects.sweepIntensity ?? sweepSpec.intensity)
          : 0;
      }
      const progress = Math.round((seconds / config.durationSeconds) * 200) / 200;
      host.dataset.assemblyProgress = String(progress);
      if (onProgress && progress !== reportedProgress) {
        reportedProgress = progress;
        onProgress(progress);
      }
    }

    function draw(sceneChanged = true) {
      if (disposed || !visible) return;
      try {
        if (sceneChanged) atmosphere?.invalidate();
        composer?.render();
        if (shaderFailed) throw new Error("WebGL shader compilation failed.");
        host.dataset.renderFrames = String(++drawCount);
        host.dataset.fogTime = (atmosphere?.time ?? 0).toFixed(3);
        host.dataset.fogInteraction = (atmosphere?.getPointerStrength() ?? 0).toFixed(3);
        host.dataset.sceneCaptures = String(atmosphere?.sceneCaptures ?? 0);
        host.dataset.fogResolution = atmosphere?.getFogSize() ?? "none";
        host.dataset.fogQuality = String(atmosphere?.getQuality() ?? 0);
        if (sceneChanged) {
          host.dataset.cameraPosition = camera.position.toArray().join(",");
          projectSocialLinks(
            options.socialHost,
            socials?.anchors,
            camera,
            viewportWidth,
            viewportHeight,
            true,
          );
        }
      } catch (error) {
        onFailure();
        dispose();
        console.warn("KELD scene rendering stopped safely.", error);
      }
    }

    advanceScene = (delta) => {
      elapsed = Math.min(config.durationSeconds, elapsed + delta * 0.7);
      sample(elapsed);
      if (elapsed >= config.durationSeconds) {
        playing = false;
        onPlaying(false);
      }
    };
    drawScene = draw;
    settleScene = () => {
      elapsed = config.durationSeconds;
      sample(elapsed);
      draw();
    };

    function updateCamera(
      width: number,
      height: number,
      mobile: boolean,
      progress = elapsed / config.durationSeconds,
    ) {
      const authored = mobile ? config.cameras.mobile : config.cameras.desktop;
      const spec = cameraEdited ? (tuner?.get().camera ?? authored) : authored;
      frameSceneCamera(camera, spec, authored, width, height, mobile, cameraEdited ? 1 : progress);
      atmosphere?.setRevealView(spec.position);
      if (orbit) {
        syncingOrbit = true;
        orbit.target.fromArray(spec.target);
        orbit.update();
        syncingOrbit = false;
      }
      syncDepthOfField(width, height, mobile);
    }

    function syncDepthOfField(
      width: number,
      height: number,
      mobile: boolean,
      composerResized = false,
    ) {
      if (!defocus || !config.depthOfField || !renderer) return;
      const tuning = tuner?.get().effects;
      const enabled =
        (tuning?.depthOfFieldEnabled ?? false) &&
        (tuning?.maxBlur ?? config.depthOfField.maxBlur) > 0 &&
        (!config.depthOfField.desktopOnly || !mobile);
      defocus.enabled = enabled;
      // OrbitControls changes the view WITHOUT passing through updateCamera.
      // Focus must always follow the current view matrix.
      camera.updateMatrixWorld();
      const focus = new Vector3(...config.depthOfField.target).applyMatrix4(
        camera.matrixWorldInverse,
      );
      defocus.materialBokeh.uniforms.focus.value = Math.max(camera.near, -focus.z);
      defocus.materialBokeh.uniforms.aperture.value =
        tuning?.aperture ?? config.depthOfField.aperture;
      defocus.materialBokeh.uniforms.maxblur.value = Math.min(
        tuning?.maxBlur ?? config.depthOfField.maxBlur,
        6 / width,
      );
      // Composer.setSize resizes EVERY pass, even disabled ones. Resize the DOF
      // target afterwards; restore the full target when re-enabling without a
      // window resize, otherwise the next DOF frame uses a stale 1x1 depth map.
      const ratio = renderer.getPixelRatio();
      const targetWidth = enabled ? Math.max(1, Math.floor(width * ratio)) : 1;
      const targetHeight = enabled ? Math.max(1, Math.floor(height * ratio)) : 1;
      if (
        composerResized ||
        dofTargetSize?.width !== targetWidth ||
        dofTargetSize?.height !== targetHeight
      ) {
        defocus.setSize(targetWidth, targetHeight);
        dofTargetSize = { width: targetWidth, height: targetHeight };
      }
    }

    function resize(force = false) {
      if (disposed || !renderer || !composer) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      if (!force && width === viewportWidth && height === viewportHeight) return;
      viewportWidth = width;
      viewportHeight = height;
      const mobile = matchMedia(HERO_COMPACT_QUERY).matches;
      atmosphere?.setCompact(mobile);
      socials?.setCompact(mobile);
      updateCamera(width, height, mobile);
      const pixelRatio = scenePixelRatio(width, height, mobile);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      syncDepthOfField(width, height, mobile, true);
      const reflectionSize = mobile ? 256 : 512;
      reflector?.getRenderTarget().setSize(reflectionSize, reflectionSize);
      draw();
    }

    // Reduced motion/data saver start settled; otherwise play one assembly, then ambient fog.
    elapsed = motion.enabled ? 0 : config.durationSeconds;
    playing = motion.enabled;
    sample(elapsed);
    syncWindowSource();
    captureEnvironment();
    resize();
    if (disposed) throw new Error("The first 3D frame could not be rendered.");
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(host);
    signal.addEventListener("abort", dispose, { once: true });
    signal.throwIfAborted();
    motion.start();

    // eslint-disable-next-line no-restricted-properties -- Build-time development-only branch.
    if (process.env.NODE_ENV === "development" && options.editor && tuner) {
      // Loaded only in the local editing lab. No global window listeners or
      // perpetual controls loop; pointer changes trigger a single redraw.
      const { OrbitControls: Orbit } = await import("three/addons/controls/OrbitControls.js");
      signal.throwIfAborted();
      orbit = new Orbit(camera, renderer.domElement);
      orbit.enableDamping = false;
      orbit.enablePan = true;
      orbit.minDistance = 0.7;
      orbit.maxDistance = 38;
      orbit.target.fromArray(tuner.get().camera.target);
      orbit.update();
      orbit.addEventListener("change", () => {
        if (disposed || syncingOrbit || !tuner || !orbit) return;
        try {
          tuner.syncOrbit(camera.position.toArray() as Vec3, orbit.target.toArray() as Vec3);
          cameraEdited = true;
          options.onTuningChange?.(tuner.get());
          syncDepthOfField(
            Math.max(1, host.clientWidth),
            Math.max(1, host.clientHeight),
            matchMedia(HERO_COMPACT_QUERY).matches,
          );
          draw();
        } catch {
          // Reject invalid extremes rather than exporting an unusable camera.
          updateCamera(
            Math.max(1, host.clientWidth),
            Math.max(1, host.clientHeight),
            matchMedia(HERO_COMPACT_QUERY).matches,
          );
        }
      });
    }

    const play = () => {
      if (disposed) return;
      if (elapsed >= config.durationSeconds) elapsed = 0;
      playing = true;
      motion.cancel();
      onPlaying(true);
      motion.request();
    };

    return {
      renderMode: "raster",
      play,
      pause() {
        if (disposed) return;
        playing = false;
        motion.cancel();
        onPlaying(false);
        motion.request();
      },
      replay() {
        if (disposed) return;
        elapsed = 0;
        atmosphere?.setRevealView(camera.position.toArray());
        sample(0);
        draw();
        play();
      },
      seek(progress) {
        if (disposed) return;
        playing = false;
        motion.cancel();
        elapsed = Math.max(0, Math.min(1, progress)) * config.durationSeconds;
        sample(elapsed);
        draw();
        onPlaying(false);
        motion.request();
      },
      setEnergy(value) {
        if (disposed) return;
        energy = value;
        sample(elapsed);
        draw();
        scheduleReflectionUpdate();
      },
      getMotion: () => motion.enabled,
      setMotion(value) {
        motion.setEnabled(value);
      },
      setVisible(value) {
        if (disposed) return;
        visible = value;
        motion.setVisible(value);
        if (visible) {
          if (reflectionDirty) scheduleReflectionUpdate();
          draw();
        }
      },
      getTuning: () => tuner?.get() ?? null,
      getDefaultTuning: () => tuner?.getDefaults() ?? null,
      capturePoster(mode) {
        if (disposed || !renderer || !composer)
          throw new Error("The scene is not ready for capture.");
        const mobile = mode === "mobile";
        const width = mobile ? 1080 : 1920;
        const height = mobile ? 1350 : 1080;
        const spec = config.cameras[mode];
        try {
          sample(config.durationSeconds);
          // Export the actual WebGL lighting at the authored poster framing.
          // Reading immediately after rendering needs no persistent draw buffer.
          camera.position.fromArray(spec.position);
          camera.lookAt(...spec.target);
          camera.fov = spec.fov;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
          renderer.setPixelRatio(1);
          renderer.setSize(width, height, false);
          composer.setPixelRatio(1);
          composer.setSize(width, height);
          syncDepthOfField(width, height, mobile, true);
          atmosphere?.invalidate();
          composer.render();
          return renderer.domElement.toDataURL("image/png");
        } finally {
          sample(elapsed);
          resize(true);
        }
      },
      async applyTuning(preset) {
        if (!tuner || disposed) return false;
        const before = tuner.get();
        // Texture selection is asynchronous. Never claim the preset is applied
        // or draw until all three maps are loaded and the latest request wins.
        const applied = await tuner.apply(preset);
        if (!applied || disposed) return false;
        const after = tuner.get();
        if (JSON.stringify(before.camera) !== JSON.stringify(after.camera)) {
          cameraEdited =
            JSON.stringify(after.camera) !== JSON.stringify(tuner.getDefaults().camera);
        }
        syncWindowSource();
        updateCamera(
          Math.max(1, host.clientWidth),
          Math.max(1, host.clientHeight),
          matchMedia(HERO_COMPACT_QUERY).matches,
        );
        syncDepthOfField(
          Math.max(1, host.clientWidth),
          Math.max(1, host.clientHeight),
          matchMedia(HERO_COMPACT_QUERY).matches,
        );
        sample(elapsed);
        draw();
        if (reflectionSignature(before) !== reflectionSignature(after)) scheduleReflectionUpdate();
        return true;
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
