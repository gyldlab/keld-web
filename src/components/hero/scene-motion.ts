import type { AtmospherePass } from "@/components/hero/atmosphere-pass";
import { HERO_COMPACT_QUERY } from "@/components/hero/scene-assets";

type MotionOptions = {
  advanceAnimation(delta: number): void;
  atmosphere(): AtmospherePass | undefined;
  draw(sceneChanged: boolean): void;
  enabledChanged(enabled: boolean): void;
  isPlaying(): boolean;
};

/** One bounded loop for intro + ambient motion; all listeners have one owner. */
export function createSceneMotion(host: HTMLElement, options: MotionOptions) {
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const compact = matchMedia(HERO_COMPACT_QUERY);
  const connection = (
    navigator as Navigator & {
      connection?: EventTarget & { saveData?: boolean };
    }
  ).connection;
  const surface = host.closest<HTMLElement>(".hero-section") ?? host;
  let userChoice: boolean | undefined;
  let enabled = !preference.matches && !connection?.saveData;
  let visible = true;
  let disposed = false;
  let frame = 0;
  let previousTime = 0;
  let nextFrameTime = 0;
  let slowFrames = 0;

  function cancel() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    nextFrameTime = 0;
  }
  function request() {
    if (!disposed && visible && !frame && (enabled || options.isPlaying()))
      frame = requestAnimationFrame(tick);
  }
  function tick(time: number) {
    frame = 0;
    if (disposed || !visible || (!enabled && !options.isPlaying())) return;
    const movingObjects = options.isPlaying();
    const interval = 1000 / (movingObjects ? 60 : compact.matches ? 24 : 30);
    if (nextFrameTime && time < nextFrameTime - 0.8) {
      request();
      return;
    }
    const delta = previousTime ? Math.min(0.1, (time - previousTime) / 1000) : 0;
    previousTime = time;
    nextFrameTime = nextFrameTime ? nextFrameTime + interval : time + interval;
    if (nextFrameTime < time) nextFrameTime = time + interval;
    if (movingObjects) options.advanceAnimation(delta);
    if (enabled) options.atmosphere()?.advance(delta);
    options.draw(movingObjects);
    if (!movingObjects && delta > (interval / 1000) * 1.8) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 12 && options.atmosphere()?.lowerQuality()) slowFrames = 0;
    request();
  }
  function sync() {
    if (disposed) return;
    enabled = userChoice ?? (!preference.matches && !connection?.saveData);
    cancel();
    host.dataset.atmosphereMotion = enabled ? "running" : "paused";
    options.enabledChanged(enabled);
    request();
  }
  const preferenceChanged = () => {
    userChoice = undefined;
    sync();
  };
  const pointerMoved = (event: PointerEvent) => {
    if (!enabled || !visible || event.pointerType === "touch") return;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    options.atmosphere()?.setPointer(x * 2 - 1, 1 - y * 2, x >= 0 && x <= 1 && y >= 0 && y <= 1);
  };
  const pointerLeft = () => options.atmosphere()?.setPointer(0, 0, false);

  return {
    get enabled() {
      return enabled;
    },
    cancel,
    request,
    start() {
      preference.addEventListener("change", preferenceChanged);
      connection?.addEventListener("change", preferenceChanged);
      surface.addEventListener("pointermove", pointerMoved, { passive: true });
      surface.addEventListener("pointerleave", pointerLeft, { passive: true });
      sync();
    },
    setEnabled(value: boolean) {
      // An explicit visitor choice can opt into motion; OS changes reset it.
      userChoice = value;
      sync();
    },
    setVisible(value: boolean) {
      visible = value;
      cancel();
      request();
    },
    dispose() {
      disposed = true;
      cancel();
      preference.removeEventListener("change", preferenceChanged);
      connection?.removeEventListener("change", preferenceChanged);
      surface.removeEventListener("pointermove", pointerMoved);
      surface.removeEventListener("pointerleave", pointerLeft);
    },
  };
}
