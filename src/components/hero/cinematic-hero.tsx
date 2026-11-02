"use client";

import { useEffect, useRef, useState } from "react";

import dynamic from "next/dynamic";

import type { ScenePreset } from "@/components/hero/editor/scene-preset";
import { sceneDraftKey } from "@/components/hero/scene-assets";
import type { SceneController } from "@/components/hero/scene-runtime";

const SceneInspector = dynamic(
  () => import("@/components/hero/editor/scene-inspector").then((module) => module.SceneInspector),
  { ssr: false },
);

/** The hero is always the live scene. Controls never replace or unmount it. */
export function CinematicHero({
  controls = false,
  editor = false,
}: {
  controls?: boolean;
  editor?: boolean;
}) {
  // Defense in depth: neither an accidentally passed prop nor an old browser
  // draft may activate Scene Lab in a production client bundle.
  // eslint-disable-next-line no-restricted-properties -- Next.js replaces this at build time.
  const studioEnabled = process.env.NODE_ENV === "development" && (editor || controls);
  const host = useRef<HTMLDivElement>(null);
  const socialHost = useRef<HTMLElement>(null);
  const syncInspector = useRef<((preset: ScenePreset) => void) | null>(null);
  const [controller, setController] = useState<SceneController | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [motion, setMotion] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const abort = new AbortController();
    let runtime: SceneController | undefined;
    let intersecting = true;
    const visible = () => intersecting && document.visibilityState === "visible";
    const syncVisibility = () => runtime?.setVisible(visible());
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries)
        if (entry.target === element) intersecting = entry.isIntersecting;
      syncVisibility();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", syncVisibility);
    // Background tabs can suspend resource initialization; allow a visible retry.
    const timeout = setInterval(() => {
      if (document.visibilityState === "visible") abort.abort("scene-load-timeout");
    }, 120000);
    const fail = () => {
      if (abort.signal.reason === "component-unmounted") return;
      setFailed(true);
      setController(null);
      runtime?.dispose();
    };
    void (async () => {
      try {
        const { createScene } = await import("@/components/hero/scene-runtime");
        abort.signal.throwIfAborted();
        runtime = await createScene(element, {
          signal: abort.signal,
          editor: studioEnabled,
          onFailure: fail,
          onPlaying: () => undefined,
          onMotionChange: setMotion,
          socialHost: socialHost.current ?? undefined,
          restoreTuning: studioEnabled
            ? (defaults) => {
                try {
                  const saved = localStorage.getItem(sceneDraftKey(defaults.asset));
                  return saved && saved.length < 120_000 ? JSON.parse(saved) : null;
                } catch {
                  return null;
                }
              }
            : undefined,
          onTuningChange: studioEnabled ? (preset) => syncInspector.current?.(preset) : undefined,
        });
        abort.signal.throwIfAborted();
        clearInterval(timeout);
        runtime.setVisible(visible());
        setController(runtime);
      } catch (error) {
        clearInterval(timeout);
        runtime?.dispose();
        fail();
        if (abort.signal.reason !== "component-unmounted")
          console.warn("KELD live 3D scene could not start.", error);
      }
    })();
    return () => {
      abort.abort("component-unmounted");
      clearInterval(timeout);
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      runtime?.dispose();
    };
  }, [attempt, studioEnabled]);

  return (
    <div
      className="cinematic-stage"
      data-scene-state={failed ? "error" : controller ? "live" : "loading"}
    >
      <div
        className="scene-viewport"
        data-ready={!!controller && !failed}
        ref={host}
        role="img"
        aria-label="Live 3D KELD sculpture assembling on stone, with drifting interactive fog, lighting and shadows."
      />
      <nav
        ref={socialHost}
        aria-label="KELD and GYLDLAB social links"
        className="pointer-events-none absolute inset-0 z-3"
      >
        {[
          { id: "github", name: "KELD on GitHub", href: "https://github.com/gyldlab/keld" },
          { id: "x", name: "GYLDLAB on X (Twitter)", href: "https://x.com/GYLDLAB" },
          {
            id: "linkedin",
            name: "GYLDLAB on LinkedIn",
            href: "https://www.linkedin.com/company/gyldlab/",
          },
        ].map((social) => (
          <a
            key={social.id}
            data-social={social.id}
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            title={social.name}
            aria-label={`${social.name} (opens in a new tab)`}
            tabIndex={-1}
            style={{ visibility: "hidden" }}
            className="pointer-events-auto absolute top-0 left-0 block size-12 rounded-lg outline-offset-4 transition-shadow hover:shadow-[0_0_24px_#b2dbef22] focus-visible:outline-2 focus-visible:outline-[#d6efff] motion-reduce:transition-none"
          >
            <span className="sr-only">{social.name}</span>
          </a>
        ))}
      </nav>
      {controller && !failed && (
        <button
          type="button"
          aria-label={motion ? "Pause scene animation" : "Resume scene animation"}
          aria-pressed={!motion}
          onClick={() => controller.setMotion?.(!motion)}
          className="pointer-events-auto absolute top-20 right-4 bottom-auto z-4 flex min-h-11 items-center gap-2.5 rounded-full border border-white/15 bg-[#07101b]/75 px-4 text-[10px] tracking-[0.16em] text-[#b8cddd] uppercase backdrop-blur-sm transition-colors hover:border-white/40 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c6e8ff] motion-reduce:transition-none min-[901px]:top-auto min-[901px]:right-14 min-[901px]:bottom-20"
        >
          <span aria-hidden="true">{motion ? "Ⅱ" : "▷"}</span>
          {motion ? "Pause motion" : "Resume motion"}
        </button>
      )}
      {!controller && (
        <div className="scene-launcher">
          <span role="status">
            {failed
              ? "The live 3D scene could not load on this device."
              : "Rendering live 3D scene…"}
          </span>
          {failed && (
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              Retry 3D
            </button>
          )}
        </div>
      )}
      <noscript>
        <p className="scene-launcher">Enable JavaScript to view the live 3D scene.</p>
      </noscript>
      {studioEnabled && controller && !failed && (
        <SceneInspector controller={controller} initiallyOpen={controls} syncRef={syncInspector} />
      )}
    </div>
  );
}
