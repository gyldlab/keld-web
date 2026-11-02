import type GUI from "lil-gui";

import type { SocialTuning } from "@/components/hero/_types/scene-preset";
import type { SceneController } from "@/components/hero/scene-runtime";
import { SOCIAL_IDS } from "@/components/hero/social-settings";

/** Bind directly to the preset objects so import/export and local saves stay in sync. */
export function addSocialControls(
  gui: GUI,
  values: SocialTuning,
  defaults: SocialTuning,
  commit: () => Promise<void>,
  controller: SceneController,
) {
  const root = gui.addFolder("Social logos · placement & movement");
  const names = { github: "GitHub", x: "X / Twitter", linkedin: "LinkedIn" };
  const positionLabels = ["X · left / right", "Y · up / down", "Z · front / back"];
  const rotationLabels = ["X · tilt (°)", "Y · turn (°)", "Z · roll (°)"];
  for (const id of SOCIAL_IDS) {
    const value = values[id];
    const folder = root.addFolder(names[id]);
    folder.add(value, "enabled").name("Show logo").onChange(commit);
    folder.add(value, "desktop").name("Show on desktop").onChange(commit);
    folder.add(value, "mobile").name("Show on mobile").onChange(commit);
    const position = folder.addFolder("Position · scene units");
    position.domElement.title =
      "X moves left/right, Y moves up/down, Z moves front/back in the authored scene. The camera angle changes their screen direction. The logo stays attached when the slab moves.";
    for (let axis = 0; axis < 3; axis++) {
      position.add(value.position, axis, -40, 40, 0.01).name(positionLabels[axis]).onChange(commit);
    }
    position.open();
    const rotation = folder.addFolder("Rotation · degrees");
    for (let axis = 0; axis < 3; axis++) {
      rotation.add(value.rotation, axis, -180, 180, 1).name(rotationLabels[axis]).onChange(commit);
    }
    rotation.close();
    folder.add(value, "scale", 0.1, 4, 0.01).name("Size · 1 = original").onChange(commit);
    const movement = folder.addFolder("Entrance & settling");
    movement.domElement.title =
      "Start and end are fractions of the assembly timeline: 0 is the beginning, 1 is the finish; 0.55 means 55%. Disable animation to show the logo immediately.";
    movement.add(value.reveal, "enabled").name("Animate entrance").onChange(commit);
    movement
      .add(value.reveal, "start", 0, 0.99, 0.01)
      .name("Start · timeline 0–1")
      .onChange(() => {
        value.reveal.end = Math.max(value.reveal.end, Math.min(1, value.reveal.start + 0.01));
        void commit();
      });
    movement
      .add(value.reveal, "end", 0.01, 1, 0.01)
      .name("Finish · timeline 0–1")
      .onChange(() => {
        value.reveal.start = Math.min(value.reveal.start, Math.max(0, value.reveal.end - 0.01));
        void commit();
      });
    movement.add(value.reveal, "lift", 0, 2, 0.01).name("Settle distance").onChange(commit);
    movement.add(value.reveal, "tilt", -90, 90, 1).name("Entry tilt (°)").onChange(commit);
    movement.close();
    const actions = {
      reset() {
        const baseline = defaults[id];
        value.desktop = baseline.desktop;
        value.enabled = baseline.enabled;
        value.mobile = baseline.mobile;
        value.position.splice(0, 3, ...baseline.position);
        value.rotation.splice(0, 3, ...baseline.rotation);
        value.scale = baseline.scale;
        Object.assign(value.reveal, baseline.reveal);
        void commit();
      },
    };
    folder.add(actions, "reset").name(`Reset ${names[id]}`);
    folder.close();
  }
  const preview = root.addFolder("Preview animation");
  const playback = {
    pause: () => controller.pause(),
    progress: 100,
    replay: () => controller.replay(),
  };
  preview.add(playback, "replay").name("Replay cinematic reveal");
  preview.add(playback, "pause").name("Pause assembly");
  preview
    .add(playback, "progress", 0, 100, 1)
    .name("Seek animation (%)")
    .onChange((value: number) => controller.seek(value / 100));
  preview.open();
  root.open();
}
