"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import GUI from "lil-gui";

import { parsePreset, type ScenePreset, type Vec3 } from "@/components/hero/editor/scene-preset";
import { addSocialControls } from "@/components/hero/editor/social-controls";
import { STONE_MATERIALS } from "@/components/hero/editor/stone-catalog";
import { sceneDraftKey } from "@/components/hero/scene-assets";
import type { SceneController } from "@/components/hero/scene-runtime";

type Props = {
  controller: SceneController;
  initiallyOpen?: boolean;
  renderProgress?: string;
  syncRef: RefObject<((preset: ScenePreset) => void) | null>;
};

function replaceValues(target: unknown, source: unknown) {
  if (Array.isArray(target) && Array.isArray(source)) {
    for (let i = 0; i < target.length; i++) {
      if (Array.isArray(target[i]) || (target[i] && typeof target[i] === "object")) {
        replaceValues(target[i], source[i]);
      } else {
        target[i] = source[i];
      }
    }
  } else if (target && source && typeof target === "object" && typeof source === "object") {
    const t = target as Record<string, unknown>,
      s = source as Record<string, unknown>;
    for (const key of Object.keys(t)) {
      if (Array.isArray(t[key]) || (t[key] && typeof t[key] === "object")) {
        replaceValues(t[key], s[key]);
      } else {
        t[key] = s[key];
      }
    }
  }
}

const labels = ["X", "Y", "Z"] as const;
const storageKey = sceneDraftKey;

/** Values live in typed JSON, never directly in React state/mesh data. */
export function SceneInspector({
  controller,
  initiallyOpen = false,
  renderProgress,
  syncRef,
}: Props) {
  const physical = controller.renderMode === "pathtraced";
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragging = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    left: number;
    top: number;
  } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const presetRef = useRef<ScenePreset | null>(null);
  const guiRef = useRef<GUI | null>(null);
  const [open, setOpen] = useState(initiallyOpen);
  const [savingImage, setSavingImage] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [message, setMessage] = useState("Changes apply live · saved locally to this browser");

  useEffect(() => {
    if (!containerRef.current) return;
    const baseline = controller.getDefaultTuning();
    const loaded = controller.getTuning();
    if (!baseline || !loaded) return;
    let active = true;
    // Runtime restores the draft before drawing the first visible frame.
    presetRef.current = loaded;
    const physicalLens = { fStop: Math.sqrt(0.008 / Math.max(loaded.effects.aperture, 0.00001)) };

    const gui = new GUI({
      title: physical ? "PHYSICAL SCENE / XL PBR" : "SCENE LAB / XL PBR",
      autoPlace: false,
      container: containerRef.current,
      width: 320,
      closeFolders: true,
    });
    guiRef.current = gui;
    gui.domElement.classList.add("keld-lil-gui");
    const commit = async () => {
      // lil-gui can retain a window mousemove handler until mouseup. A stale
      // drag must never save a preset after the editor has been unmounted.
      if (!active) return;
      try {
        if (loaded.stone.id !== controller.getTuning()?.stone.id) {
          setMessage("Loading the selected stone material…");
        }
        const accepted = await controller.applyTuning(loaded);
        if (!active || !accepted) return;
        const applied = controller.getTuning();
        if (applied) replaceValues(loaded, applied);
        // XYZ edits are also camera edits. Keep the angular controls tied to
        // the accepted camera instead of retaining a stale orbit radius.
        fromPosition();
        gui.controllersRecursive().forEach((item) => item.updateDisplay());
        try {
          localStorage.setItem(storageKey(baseline.asset), JSON.stringify(loaded));
        } catch {
          /* disabling storage never disables the editor */
        }
        if (active) setMessage("Live preview updated · local draft saved");
      } catch (error) {
        if (!active) return;
        const current = controller.getTuning();
        if (current) replaceValues(loaded, current);
        fromPosition();
        gui.controllersRecursive().forEach((item) => item.updateDisplay());
        if (active) setMessage(error instanceof Error ? error.message : "Invalid scene value");
      }
    };
    const numeric = <T extends object>(
      folder: GUI,
      object: T,
      key: keyof T,
      min: number,
      max: number,
      step: number,
      name?: string,
    ) => {
      const item = folder.add(object, key, min, max, step);
      if (name) item.name(name);
      item.onChange(commit);
      return item;
    };
    const toggle = <T extends object>(folder: GUI, object: T, key: keyof T, name?: string) => {
      const item = folder.add(object, key);
      if (name) item.name(name);
      item.onChange(commit);
    };
    const tint = <T extends object>(folder: GUI, object: T, key: keyof T, name?: string) => {
      const item = folder.addColor(object, key);
      if (name) item.name(name);
      item.onChange(commit);
    };
    const xyz = (parent: GUI, title: string, vector: Vec3, min = -20, max = 20, step = 0.05) => {
      const folder = parent.addFolder(title);
      for (let i = 0; i < 3; i++) numeric(folder, vector, i, min, max, step, labels[i]);
      folder.close();
      return folder;
    };

    const camera = gui.addFolder("Camera & angles");
    xyz(camera, "Camera position", loaded.camera.position, -30, 30);
    xyz(camera, "Look-at point", loaded.camera.target, -20, 20);
    numeric(camera, loaded.camera, "fov", 12, 90, 0.1, "Field of view (°)");
    // Convenience spherical angle controls; the canonical data stays XYZ.
    const orbit = { azimuth: 0, elevation: 0, radius: 1 };
    const fromPosition = () => {
      physicalLens.fStop = Math.sqrt(0.008 / Math.max(loaded.effects.aperture, 0.00001));
      const p = loaded.camera.position,
        t = loaded.camera.target;
      const dx = p[0] - t[0],
        dy = p[1] - t[1],
        dz = p[2] - t[2];
      orbit.radius = Math.max(0.2, Math.hypot(dx, dy, dz));
      orbit.azimuth = (Math.atan2(dx, dz) * 180) / Math.PI;
      orbit.elevation = (Math.asin(Math.max(-1, Math.min(1, dy / orbit.radius))) * 180) / Math.PI;
    };
    const applyAngles = () => {
      const yaw = (orbit.azimuth * Math.PI) / 180;
      const pitch = (orbit.elevation * Math.PI) / 180;
      const h = orbit.radius * Math.cos(pitch),
        t = loaded.camera.target;
      loaded.camera.position[0] = t[0] + Math.sin(yaw) * h;
      loaded.camera.position[1] = t[1] + Math.sin(pitch) * orbit.radius;
      loaded.camera.position[2] = t[2] + Math.cos(yaw) * h;
      commit();
      gui.controllersRecursive().forEach((item) => item.updateDisplay());
    };
    fromPosition();
    const angles = camera.addFolder("Orbit by angles");
    angles.add(orbit, "azimuth", -180, 180, 0.5).name("Azimuth (°)").onChange(applyAngles);
    angles.add(orbit, "elevation", -85, 85, 0.5).name("Elevation (°)").onChange(applyAngles);
    angles.add(orbit, "radius", 0.7, 35, 0.1).name("Distance").onChange(applyAngles);
    angles.close();
    camera.open();

    const atmosphere = gui.addFolder("Environment & exposure");
    tint(atmosphere, loaded.atmosphere, "background", "Backdrop");
    numeric(atmosphere, loaded.atmosphere, "exposure", 0.1, 4, 0.01, "Exposure");
    if (!physical) {
      numeric(
        atmosphere,
        loaded.atmosphere,
        "environmentIntensity",
        0,
        2,
        0.01,
        "Environment reflections",
      );
      numeric(atmosphere, loaded.atmosphere, "hemisphereIntensity", 0, 2, 0.005, "Ambient light");
    }
    tint(atmosphere, loaded.atmosphere, "fogColor", "Distance fog tint");
    numeric(atmosphere, loaded.atmosphere, "fogDensity", 0, 0.05, 0.0005, "Distance fog density");
    atmosphere.open();

    if (!physical) {
      const movingFog = gui.addFolder("Moving fog · atmosphere");
      tint(movingFog, loaded.atmosphere.movingFog, "color", "Fog color");
      numeric(movingFog, loaded.atmosphere.movingFog, "density", 0, 0.25, 0.005, "Fog thickness");
      numeric(movingFog, loaded.atmosphere.movingFog, "speed", 0, 3, 0.05, "Drift speed");
      numeric(
        movingFog,
        loaded.atmosphere.movingFog,
        "cursorStrength",
        0,
        2,
        0.05,
        "Mouse response",
      );
      movingFog.open();
    }

    const lights = gui.addFolder("Light sources");
    loaded.lights.forEach((item) => {
      const folder = lights.addFolder(item.name.replace(/([a-z])([A-Z])/g, "$1 $2"));
      toggle(folder, item, "enabled", "Enabled");
      tint(folder, item, "color", "Color");
      numeric(
        folder,
        item,
        "intensity",
        0,
        item.type === "spot" ? 1800 : 250,
        0.1,
        "Intensity (web)",
      );
      xyz(folder, "Position", item.position);
      xyz(folder, "Aim / target", item.target);
      if (item.type === "area") {
        numeric(folder, item, "width", 0.05, 20, 0.05, "Width");
        numeric(folder, item, "height", 0.05, 20, 0.05, "Height");
      } else {
        numeric(folder, item, "angle", 0.01, 1.57, 0.01, "Cone half-angle (rad)");
        numeric(folder, item, "penumbra", 0, 1, 0.01, "Penumbra");
        numeric(folder, item, "distance", 0, 120, 0.1, "Reach");
        numeric(folder, item, "decay", 0, 4, 0.05, "Distance decay");
      }
      folder.close();
    });
    lights.close();

    if (!physical) {
      const shadows = gui.addFolder("Cast shadows");
      toggle(shadows, loaded.shadows, "enabled", "Enable shadows");
      numeric(shadows, loaded.shadows, "opacity", 0, 1, 0.01, "Strength");
      numeric(shadows, loaded.shadows, "radius", 0, 8, 0.1, "Softness (PCF)");
      numeric(shadows, loaded.shadows, "bias", -0.01, 0.01, 0.00005, "Depth bias");
      numeric(shadows, loaded.shadows, "normalBias", -0.05, 0.05, 0.0005, "Normal bias");
      shadows
        .add(loaded.shadows, "mapSize", { "512": 512, "1024": 1024, "2048": 2048 })
        .name("Shadow resolution")
        .onChange(commit);
      shadows.close();
    }

    // Stone texture library: the five entries include the untouched authored
    // baseline and four locally hosted CC0 PBR materials.
    const stones = gui.addFolder("SLAB STONE · material picker");
    const stoneChoices = Object.fromEntries(
      Object.entries(STONE_MATERIALS).map(([id, label]) => [label, id]),
    );
    stones.add(loaded.stone, "id", stoneChoices).name("Stone material").onChange(commit);
    tint(stones, loaded.stone, "tint", "Stone tint");
    numeric(stones, loaded.stone, "tiling", 0.15, 4, 0.05, "Texture tiling");
    numeric(stones, loaded.stone, "normalStrength", 0, 1, 0.01, "Surface relief");
    stones.open();

    const materials = gui.addFolder("Material finish");
    (Object.keys(loaded.materials) as Array<keyof ScenePreset["materials"]>).forEach((key) => {
      const item = loaded.materials[key];
      const folder = materials.addFolder(
        key === "graphite" ? "Graphite front" : key === "titanium" ? "Titanium rim" : "Basalt slab",
      );
      tint(folder, item, "color", "Base color");
      numeric(folder, item, "metalness", 0, 1, 0.01, "Metallic");
      numeric(folder, item, "roughness", 0.04, 1, 0.01, "Roughness");
      folder.close();
    });
    materials.close();

    const placement = gui.addFolder("Object offsets");
    xyz(placement, "Upper piece", loaded.objects.upper, -3, 3, 0.01);
    xyz(placement, "Lower piece", loaded.objects.lower, -3, 3, 0.01);
    xyz(placement, "Basalt slab", loaded.objects.slab, -3, 3, 0.01);
    placement.close();

    if (!physical) addSocialControls(gui, loaded.socials, baseline.socials, commit, controller);

    if (physical) {
      const lens = gui.addFolder("Physical lens");
      const quality = {
        denoise: controller.getDenoising?.() ?? true,
        samples: controller.getSampleBudget?.() ?? 1024,
      };
      lens
        .add(quality, "samples", {
          "Quick · 64": 64,
          "Balanced · 256": 256,
          "Fine · 1024": 1024,
          "Final · 4096": 4096,
        })
        .name("Render samples")
        .onChange((value: number) => controller.setSampleBudget?.(value));
      lens
        .add(quality, "denoise")
        .name("Reduce render noise")
        .onChange((value: boolean) => controller.setDenoising?.(value));
      toggle(lens, loaded.effects, "depthOfFieldEnabled", "Depth of field");
      lens
        .add(physicalLens, "fStop", 2, 22, 0.1)
        .name("F-stop")
        .onChange((value: number) => {
          loaded.effects.aperture = 0.008 / (value * value);
          void commit();
        });
      lens.close();
    } else {
      const effects = gui.addFolder("Post-processing");
      toggle(effects, loaded.effects, "bloomEnabled", "Bloom enabled");
      numeric(effects, loaded.effects, "bloomStrength", 0, 2, 0.01, "Bloom strength");
      numeric(effects, loaded.effects, "bloomRadius", 0, 1, 0.01, "Bloom radius");
      numeric(effects, loaded.effects, "bloomThreshold", 0, 5, 0.05, "Bloom threshold");
      toggle(effects, loaded.effects, "depthOfFieldEnabled", "Depth of field");
      numeric(effects, loaded.effects, "aperture", 0, 0.002, 0.00001, "DOF aperture");
      numeric(effects, loaded.effects, "maxBlur", 0, 0.005, 0.0001, "DOF maximum blur");
      numeric(effects, loaded.effects, "sweepIntensity", 0, 40, 0.2, "Accent brightness");
      effects.close();
    }

    syncRef.current = (next) => {
      if (!active) return;
      replaceValues(loaded, next);
      fromPosition();
      gui.controllersRecursive().forEach((item) => item.updateDisplay());
      try {
        localStorage.setItem(storageKey(baseline.asset), JSON.stringify(loaded));
      } catch {
        /* local storage is optional */
      }
    };
    return () => {
      active = false;
      syncRef.current = null;
      gui.destroy();
      guiRef.current = null;
      presetRef.current = null;
    };
  }, [controller, physical, syncRef]);

  const setPreset = async (input: unknown): Promise<boolean> => {
    const defaults = controller.getDefaultTuning();
    if (!defaults || !presetRef.current) return false;
    const next = parsePreset(input, defaults);
    if (next.stone.id !== controller.getTuning()?.stone.id) {
      setMessage("Loading the preset's stone maps…");
    }
    const accepted = await controller.applyTuning(next);
    if (!accepted) return false;
    // The same resync also refreshes the derived angular sliders.
    if (syncRef.current) syncRef.current(next);
    else {
      replaceValues(presetRef.current, next);
      guiRef.current?.controllersRecursive().forEach((item) => item.updateDisplay());
    }
    try {
      localStorage.setItem(storageKey(defaults.asset), JSON.stringify(next));
    } catch {
      /* import still succeeds without storage */
    }
    setMessage("Preset applied · saved locally");
    return true;
  };

  const download = () => {
    const current = controller.getTuning();
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(current, null, 2) + "\n"], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `keld-scene-${current.asset}-preset.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after the navigation has begun.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage("JSON preset downloaded — website defaults remain unchanged");
  };

  const downloadPoster = async (mode: "desktop" | "mobile") => {
    if (savingImage) return;
    setSavingImage(true);
    try {
      setMessage(physical ? "Rendering a high-resolution path-traced image…" : "Saving image…");
      const a = document.createElement("a");
      a.href = await controller.capturePoster(mode);
      a.download = `keld-${controller.getTuning()?.asset ?? "scene"}-${mode}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setMessage(
        `${mode === "desktop" ? "Desktop" : "Mobile"} image saved with the current lighting and authored framing`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the image");
    } finally {
      setSavingImage(false);
    }
  };

  return (
    <aside
      ref={panelRef}
      className={`scene-editor ${open ? "is-open" : "is-closed"}`}
      aria-label="Floating scene editor"
      style={position ? { left: position.left, top: position.top, right: "auto" } : undefined}
    >
      <div
        className="scene-editor-header"
        title="Drag to reposition the scene editor"
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
          const box = panelRef.current?.getBoundingClientRect();
          if (!box) return;
          dragging.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            left: box.left,
            top: box.top,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragging.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const bounds = panelRef.current?.getBoundingClientRect();
          if (!bounds) return;
          setPosition({
            left: Math.max(
              8,
              Math.min(
                window.innerWidth - bounds.width - 8,
                drag.left + event.clientX - drag.startX,
              ),
            ),
            top: Math.max(
              8,
              Math.min(window.innerHeight - 54, drag.top + event.clientY - drag.startY),
            ),
          });
        }}
        onPointerUp={(event) => {
          if (dragging.current?.pointerId === event.pointerId) {
            dragging.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
      >
        <div>
          <strong>SCENE LAB</strong>
          <span>DRAG · LIGHT · CAMERA · MATERIALS</span>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="keld-scene-editor-body"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Open"}
        </button>
      </div>
      <div id="keld-scene-editor-body" className="scene-editor-body" hidden={!open}>
        <p className="scene-editor-hint">
          {physical
            ? "This is the live 3D hero. Drag the scene to orbit; edit lights and materials below. Changes restart ray tracing. Hiding these controls keeps the scene active."
            : "Drag the 3D scene to orbit. Lighting, shadows and materials update live."}
        </p>
        {physical && (
          <p className="scene-editor-message" aria-live="off">
            {renderProgress}
          </p>
        )}
        <div
          ref={containerRef}
          className="scene-editor-gui"
          inert={savingImage}
          style={savingImage ? { pointerEvents: "none", opacity: 0.55 } : undefined}
        />
        <div className="scene-editor-actions">
          <button
            type="button"
            disabled={savingImage}
            onClick={async () => {
              const defaults = controller.getDefaultTuning();
              if (defaults) {
                try {
                  if (await setPreset(defaults)) {
                    try {
                      localStorage.removeItem(storageKey(defaults.asset));
                    } catch {
                      /* ignored */
                    }
                    setMessage("Restored the authored XL PBR scene");
                  }
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Could not reset the scene");
                }
              }
            }}
          >
            Reset
          </button>
          <button type="button" onClick={download}>
            Export JSON
          </button>
          <button type="button" disabled={savingImage} onClick={() => uploadRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={uploadRef}
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            aria-label="Import scene tuning JSON"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 120_000) {
                setMessage("Preset too large (120 KB maximum)");
                return;
              }
              try {
                await setPreset(JSON.parse(await file.text()));
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Cannot import this preset");
              }
            }}
          />
        </div>
        <div className="scene-editor-actions">
          <button type="button" disabled={savingImage} onClick={() => downloadPoster("desktop")}>
            Save desktop PNG
          </button>
          <button type="button" disabled={savingImage} onClick={() => downloadPoster("mobile")}>
            Save mobile PNG
          </button>
          {savingImage && controller.cancelCapture && (
            <button type="button" onClick={() => controller.cancelCapture?.()}>
              Cancel render
            </button>
          )}
        </div>
        <p className="scene-editor-message" role="status">
          {message}
        </p>
        <p className="scene-editor-disclaimer">
          Presets are local browser drafts. Export a JSON file to hand off exact settings; this
          editor never publishes the website.
        </p>
      </div>
    </aside>
  );
}
