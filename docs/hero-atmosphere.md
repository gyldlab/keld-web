# KELD hero: atmosphere, motion and editing

## Result and design intent

The hero combines the existing KELD assembly with a smoke flush that travels from near the camera into the scene, a bounded volume of drifting rear fog, a soft mouse disturbance and three physical social plaques on the stone slab. The main mark remains the focal point. Four overlapping smoke volumes turn around it in three dimensions; the social marks appear late in the assembly and remain secondary.

The homepage has two deliberate modes. Development opens the existing Scene Lab, including controls for the new fog. Production renders the public composition without the editor or development links. Both lab routes return HTTP 404 in production. Browser drafts never activate production editing.

This is real-time WebGL raster rendering with a small volumetric postprocess. It does not introduce progressive path tracing, a downloaded smoke movie or a full fluid simulation. The mouse disturbance is an art-directed approximation of air movement. It is not a physically complete simulation of smoke colliding with every object.

## Terms, from the scene upward

| Term               | Meaning in this scene                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Scene              | The collection of objects, lights and environment that the renderer sees.                                                         |
| Camera             | The virtual viewpoint. Its position, aim and field of view determine framing.                                                     |
| Geometry           | The vertices and triangles that define an object's shape.                                                                         |
| Material           | The rules for the appearance of that shape: color, roughness, metallic response and textures.                                     |
| Mesh               | Geometry combined with a material and a position in the scene. The slab and plaques are meshes.                                   |
| Texture            | A grid of values sampled by a material or shader. It may hold an image, surface detail, depth or density.                         |
| Shader             | A small program run on the graphics processor. Our fog shader calculates the atmosphere for a pixel.                              |
| Density            | How strongly a small region of fog scatters and blocks light. Different values produce wisps.                                     |
| Noise field        | Smoothly varying values used to make irregular natural shapes. This implementation stores a repeatable three-dimensional field.   |
| Depth texture      | The distance information from visible solid surfaces. It prevents integrating fog through the front of the slab or mark.          |
| Ray marching       | Sampling several positions along a viewing ray and accumulating their contribution. Here, only the bounded fog region is sampled. |
| Transmittance      | The fraction of background light that survives the fog. A value of one means fully clear.                                         |
| Render target      | An image buffer on the graphics processor. It stores the scene, its depth or the fog for a later step.                            |
| Postprocessing     | Combining or adjusting rendered images after drawing the scene geometry.                                                          |
| Damping            | Gradually approaching a target instead of snapping to it. This makes cursor movement feel like air rather than a hard brush.      |
| Device pixel ratio | The relationship between screen pixels and CSS layout pixels. Capping it bounds rendering work on dense displays.                 |

Three.js documents the basic scene, material and rendering model in its [manual](https://threejs.org/manual/). Its [fog guide](https://threejs.org/manual/pages/fog.html) describes the built-in distance fog. That effect blends distant surfaces toward a fog color; it does not create the moving density structure required here.

## Research and asset choices

| Reference                                                                                                                                                                   | What it provides                                                                                                                      | Decision for KELD                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [Three.js volume cloud example](https://threejs.org/examples/webgl_volume_cloud.html)                                                                                       | A working volumetric rendering reference maintained with Three.js.                                                                    | Use it to check the technique against the installed Three.js rendering model.                                               |
| [Maxime Heckel: volumetric lighting](https://blog.maximeheckel.com/posts/shaping-light-volumetric-lighting-with-post-processing-and-raymarching/)                           | Explains depth reconstruction, bounded ray marching and lighting.                                                                     | Use these architectural ideas; integrate a small shader specifically for this scene.                                        |
| [NVIDIA GPU Gems 3, chapter 23](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-screen-particles)                                 | Explains why soft atmospheric effects can use smaller render targets, and why depth-aware composition matters.                        | Render the fog below the main scene resolution and preserve depth boundaries during composition.                            |
| [The Sleepers, original Codrops implementation](https://tympanus.net/codrops/2026/07/10/the-sleepers-creating-an-atmospheric-webgl-experience-with-lightweight-techniques/) | An atmospheric experience using lightweight world-space effects.                                                                      | A useful alternative when a surface-based artistic effect is sufficient. Our selected approach integrates a bounded volume. |
| [al-ro/volumetrics](https://github.com/al-ro/volumetrics)                                                                                                                   | A real-time WebGL2 volumetric workshop implementation, with an MIT license.                                                           | Reference material, not a new runtime dependency.                                                                           |
| [Kenney Smoke Particles](https://kenney.nl/assets/smoke-particles)                                                                                                          | Seventy smoke image assets under CC0.                                                                                                 | Available for a texture-card fallback. No Kenney texture was imported in this version.                                      |
| [JangaFX free VDB animations](https://jangafx.com/software/embergen/download/free-vdb-animations)                                                                           | CC0 volumetric simulation assets, including large smoke sequences. VDB is a sparse volume data format used by offline graphics tools. | Useful for offline studies or baking. Downloading those large sequences into this website is unnecessary.                   |

The selected density texture is generated locally by code. It contains 32 × 32 × 32 one-byte values: 32 KiB before graphics-driver allocation. The shader samples it at two scales and changes the sample coordinates over time. There is no additional smoke asset request and no external fog service.

The shader is project code informed by the references above. This change does not copy an entire tutorial implementation, install an unreviewed volumetric package or assume that every demo asset has the same license as its example code.

### Social assets

Prebuilt 3D social models exist. Examples include [this GitHub model](https://sketchfab.com/3d-models/3d-github-logo-441d03d1076b44f483df551e02d970fe), [this LinkedIn model](https://sketchfab.com/3d-models/3d-linkedin-logo-e8786a94c6a942c594696d58d8c59a50), and [a social collection including X](https://sketchfab.com/3d-models/social-media-icons-60aab1d19fe24b6e9bad815bbdcbc24d). These were researched, not downloaded or shipped. A model's author license does not replace the underlying brand's trademark rules.

For this composition, a matching set of small beveled plaques is more controllable than three unrelated marketplace meshes. The plaques share geometry and a gunmetal material. Their faces retain faithful flat brand artwork and its aspect ratio. GitHub comes from its current official logo archive; LinkedIn uses its official white PNG; X uses the Simple Icons vector with white fill and explicit rasterization dimensions. Exact sources are recorded in [ASSET_CREDITS.md](../ASSET_CREDITS.md).

The plaques are children of the actual `BasaltMonolith` object, with world placement converted into slab-local coordinates. They follow slab movement in Scene Lab. Native HTML links follow their projected screen positions, so keyboard navigation and normal link behavior remain available.

## How a frame is made

1. Render the solid scene into a color target with a depth texture. During assembly, update this target as the mark and plaques move.
2. Reconstruct the viewing ray from the camera and depth for each fog pixel. Intersect it with the fog box. Stop at the first opaque surface.
3. March through that segment. Sample the density field, height falloff and soft volume boundaries. Account for the existing window spotlight and its shadow depth.
4. Accumulate scattered light and attenuation. The extinction calculation uses exponential transmittance, commonly called the Beer–Lambert relationship.
5. Enlarge the fog image using neighboring depth values. Where those values cross an object boundary, integrate that full-resolution pixel's own ray and opaque depth. Do not borrow a background fog sample for a foreground pixel when interpolation has no compatible neighbor. Combine it as `scene * transmittance + scatteredLight`.
6. Apply the existing output transform once. [Three.js color management](https://threejs.org/manual/pages/color-management.html) requires lighting calculations in its linear working color space. After display conversion, Three.js's FXAA pass (fast approximate anti-aliasing) smooths the final image's pixel edges, including edges introduced by atmosphere composition.

After assembly, scene geometry and the camera are normally unchanged. The scene color and depth are reused. Only the fog and final image composition need to update. A camera, material, light, object or viewport change invalidates the cached scene. Environment reflection captures are not repeated for ordinary fog motion.

Caching has limits: future continuously moving objects must invalidate the scene each frame. Animated volumetric fog is not included in the cached environment reflection. The development-only depth-of-field option can add scene work when enabled; the production default leaves it disabled.

## Cursor behavior and choreography

Pointer coordinates are projected onto a plane through the fog at world `z = -3`. The disturbance acts within a soft spatial radius. It combines rotation around the pointer, limited directional movement and slight local clearing. Pointer movement is damped; velocity is clamped. After movement stops, its strength decays exponentially. Touch scrolling is not intercepted to imitate a mouse.

The existing authored assembly is played once at a 0.7 time scale, taking approximately 2.29 seconds for the 1.6-second clip. The foreground reveal uses four finite three-dimensional smoke volumes. Their centers start near the viewing position and travel past the mark, following staggered helical paths with horizontal and vertical movement. Each volume has longitudinal thickness, its own orientation and an irregular density pattern that twists along its depth. The previous left/right clearing mask has been removed.

`fog-reveal-flow.ts` fixes a frame from the authored camera toward the logo, then updates the four transforms on the CPU. The normal camera's cinematic movement does not drag this frame around. Replay explicitly captures an edited camera, including when the author first seeks to zero and then changes the view. The shader transforms each world sample into each moving volume's coordinates. Consequently, the smoke's apparent scale, overlap and occlusion change even when the camera is held fixed. This is art-directed volume motion, not a fluid solver or smoke geometry colliding with the mark.

The march bounds contain all four rotated volumes as well as the rear atmosphere. They expand in X, Y and Z, including above the compact camera, so the intro is not clipped by the old ambient box. Density fades near the eye and the ground. The foreground passes behind opaque geometry as it travels; a late fade from 70% to 90% removes residual wisps. At 90%, its weights reach zero and the bounds return exactly to the ambient box. No screen-space wipe is used to uncover the logo.

The camera starts slightly farther away with a restrained angular offset: 10% extra distance and about 3.7 degrees on desktop; 7% and about 2 degrees on compact layouts. Its smooth easing reaches the exact authored camera at 90% of the timeline. An edited camera takes priority, so the intro does not overwrite deliberate editor framing. Reduced-motion and data-saver starts use the final pose directly.

| Beat                                  | Timeline | Approximate playback time |
| ------------------------------------- | -------- | ------------------------- |
| Near-camera smoke cover               | Opening  | First 0.3 seconds         |
| Fast depth travel and rotating folds  | 12–60%   | 0.27–1.37 seconds         |
| Last smoke volume finishes its travel | 73.4%    | 1.68 seconds              |
| Foreground contribution reaches zero  | 90%      | 2.06 seconds              |
| Camera reaches its exact final pose   | 90%      | 2.06 seconds              |
| Last default social plaque finishes   | 95%      | 2.17 seconds              |
| Intro ends                            | 100%     | 2.29 seconds              |

Social plaques reveal from roughly 55% through 95% of the clip, with a small stagger and gentle settling. The assembly does not loop; the ambient fog continues. Its normal drift is independent of the foreground reveal timing. The shared shader exits before evaluating foreground volumes once they are gone. During the intro, samples outside the rear fog's spatial mask skip its noise lookups. Foreground noise lookups are also skipped outside each finite volume.

The pointer effect has no accumulated simulation history. This reduces memory and avoids stale motion trails after resize or camera changes. It also means the wake is localized: it is not a persistent fluid field advected across the whole scene.

## Production defaults and tuning

| Setting                 | Default / bound                                                           | Reason                                                                                      |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Fog color               | `#8eabc5`                                                                 | Restrained cool atmosphere, consistent with the window light.                               |
| Density                 | `0.065`; editor range `0–0.25`                                            | Keeps the mark and copy legible while allowing thicker studies.                             |
| Drift speed             | `1`; editor range `0–3`; base flow increased 3× in the polish revision    | Existing speed-1 drafts receive more visible movement without changing their saved setting. |
| Mouse response          | `1`; editor range `0–2`                                                   | Allows interaction to be reduced or disabled.                                               |
| Samples per ray         | Intro: 48 desktop, 32 compact. Ambient: 24 desktop, 16 compact            | Extra intro samples reduce grain while the near-camera volume spans a longer ray.           |
| Fog width               | At most 840 pixels desktop, 360 compact, also bounded by scale            | Avoids tracing at full display resolution.                                                  |
| Main pixel ratio        | At most 1.5 desktop, 2 compact; compact buffer at most 1.5 million pixels | Keeps small-screen geometry crisp while bounding tablet allocations.                        |
| Geometry multisampling  | Up to 4 samples, bounded by device support                                | Improves silhouette coverage before composition.                                            |
| Ambient cadence         | Target 30 frames/second desktop, 24 compact                               | Slow fog does not require a full-speed geometry render loop.                                |
| Slow-frame fallback     | 60% fog dimensions; 20 intro samples, 12 ambient samples                  | Reduces work after sustained slow frames.                                                   |
| Hidden/offscreen/paused | No scheduled animation frames                                             | Avoids unnecessary continuing work.                                                         |

The first assembly targets the browser's normal animation cadence, up to 60 frames/second. Targets are scheduling limits, not guarantees for every device. Moving fog always has a graphics cost while visible. It would be inaccurate to describe this version as zero-rendering while idle.

Reduced-motion and data-saving preferences begin with a settled composition. A visible Pause motion control lets any visitor stop animation. An explicit resume request can enable it. Changing the system preference resets that choice. This follows the intent of [WCAG pause, stop, hide guidance](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).

## Development and production behavior

| Surface                | Development                  | Production           |
| ---------------------- | ---------------------------- | -------------------- |
| Homepage               | Live hero and open Scene Lab | Live hero, no editor |
| Footer Scene Lab entry | Visible                      | Absent               |
| `/lab/motion`          | Editor available             | HTTP 404             |
| `/lab/physical`        | Lighting editor available    | HTTP 404             |
| Browser tuning draft   | Read and saved locally       | Ignored              |

The new **Moving fog · atmosphere** folder exposes fog color, thickness, drift speed and mouse response. **Distance fog** remains separately labeled because it changes the built-in surface fade. JSON export includes the moving-fog values. Older valid presets without these fields use the new defaults. Unknown fields, invalid colors, nonfinite numbers and out-of-range values are rejected before applying changes.

Changes in Scene Lab are browser drafts. Exporting a preset does not publish the site or change the repository defaults. The editor's top-level Hide button leaves the live scene active.

### Individual social logo controls

Each social plaque has its own settings. A visibility or transform edit applies to both its three-dimensional object and its projected HTML link. Hidden plaques must not leave invisible keyboard targets behind.

| Control                      | What the editor changes                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enabled                      | Shows or hides that logo across all layouts.                                                                                                        |
| Desktop / compact visibility | Selects the layouts where the logo appears. Compact uses the same width/aspect-ratio rule as the scene's mobile camera.                             |
| Position X / Y / Z           | Places the logo across the scene, vertically and in depth. These are scene coordinates; the current camera angle determines their screen direction. |
| Rotation X / Y / Z           | Tilts, turns and rolls the plaque in degrees.                                                                                                       |
| Scale                        | Changes the complete plaque and artwork together, preserving artwork proportions.                                                                   |
| Reveal timing                | Chooses when the plaque begins and finishes appearing within the existing assembly.                                                                 |
| Settling motion              | Controls the approach into its final position; disabling the reveal makes the settled plaque available immediately.                                 |

The authored slab transform is captured once for coordinate conversion. Moving the slab later carries its plaques with it; editing a plaque does not detach it or cancel the slab offset. The final link bounds follow the edited three-dimensional geometry. Hidden, offscreen or back-facing plaques do not expose clickable/focusable links. A center ray for each eligible plaque checks whether opaque visible geometry covers it. This is a bounded visibility approximation, not a pixel-perfect test of every visible part of the plaque.

The **Preview animation** folder contains **Replay cinematic reveal**, **Pause assembly**, and **Seek animation (%)**. Seeking lets the author inspect entrance timing at a specific point. Pause assembly freezes the assembly timeline; the separate public Pause motion button stops the whole scene's animation. Each social folder also has its own reset. Settings are included in the browser draft and JSON import/export. Valid older presets without social settings receive the original composition's defaults.

## Ownership and lifecycle

`atmosphere-pass.ts` owns its render targets, shader materials and noise texture. `fog-reveal-flow.ts` reuses four transforms, weights and bounds; it adds no GPU target or texture. `atmosphere-shaders.ts` shares the same volume integration between the coarse pass and full-resolution boundary correction. Both paths use the same uniform objects and stable sampling grid. `scene-motion.ts` owns the animation callback and input/preference listeners. `social-plinths.ts` owns shared plaque geometry, materials and brand textures. Disposal is idempotent. Async brand image loading checks cancellation and revokes temporary object URLs. Social meshes are removed before the original model disposal traverses its resources.

The boundary correction addresses the coarse fog reconstruction that caused uneven mobile silhouettes. More geometry samples and a higher compact pixel ratio improve the underlying solid edges as well. The resolved depth still represents one surface per pixel; this is not exact integration at every multisample coverage point. Higher resolution also consumes more graphics memory even though the solid scene is cached.

The rendering failure path stops the loop, releases owned resources and presents Retry 3D. A retry creates a fresh renderer. The page keeps its normal textual content and navigation even if WebGL is unavailable.

## Verification record

### Depth-flush revision

Nine desktop timeline samples were inspected with the camera fixed and ambient time frozen. The near-camera cover recedes, rotates into separate folds around the mark and crosses behind its opaque surfaces. The camera position was identical across all nine samples. A normal-camera replay also returned to the authored pose within floating-point tolerance and completed in approximately 2.30 seconds, with 138 rendered frames and no browser errors.

Six compact intro samples were checked at an emulated 390-pixel viewport and device-pixel ratio of 3. The solid buffer remained 780 × 928 and the fog buffer 360 × 428. An uninterrupted replay measured approximately 59.8 frames/second over 2.31 seconds on the desktop GPU, with no adaptive quality reduction or browser errors. This is an emulation result, not a physical-phone performance claim. The screenshot review includes the smoke crossing the mark, the rear folds and the cleared final silhouette.

The depth-flush release-build browser pass also verified continued ambient motion with unchanged solid-scene and reflection captures, cursor response and relaxation, keyboard social links, pause, offscreen stop, reduced-motion changes and narrow layouts. It measured about 29.8 desktop and 24.0 compact ambient frames/second in short observation windows. The production client had no Scene Lab and both lab routes returned 404. Formatting, lint, types, the standalone release build and the production access gate passed for this revision.

### Previous atmosphere and editor polish

The polish revision was checked again in a release-build Chromium preview with the Apple M4 Metal renderer. It measured approximately 30.3 ambient frames/second at 1440 × 900 and 24.0 at a 390-pixel viewport, over short 2.2-second observation windows. Those measurements are from the local desktop browser, including compact viewport emulation; they are not a benchmark on a physical phone or a sustained thermal test.

The development control check verified independent social position, scale and degree rotation; hidden/back-facing links leaving keyboard navigation; separate desktop/mobile visibility; per-logo reset; slab attachment after another edit; entrance timing, disable, seeking and replay; JSON export and reload; legacy import without social fields; and rejection of an invalid scale without applying it. The release build and the HTTP production gate passed, including all three social artwork assets and 404 responses for both lab routes.

The production-browser check passed with the new reveal and boundary correction: the client has no Scene Lab; fog continues while scene/depth and reflection capture counts remain unchanged after assembly; cursor response rises and relaxes; social links are keyboard accessible; pause, offscreen state and a live reduced-motion change stop animation; 390- and 320-pixel layouts have no horizontal overflow. No page or console errors were reported in that normal interaction run. Desktop, compact and reveal-stage screenshots were inspected. A separate progression check verified camera movement during the intro and an exact return to the authored final position.

With the camera fixed and cursor idle, the before/after three-second visual comparison showed more fog change: mean absolute RGB difference increased from about 1.75 to 3.31 on the 0–255 channel scale, and the percentage of pixels changing by at least two channel levels increased from about 18% to 33%. This is a composition-specific visual comparison, not a universal measure of cinematic quality. The foreground plume is absent in these settled comparisons.

An emulated device-pixel ratio of 3 at 390 CSS pixels verified a 780-pixel-wide solid-scene buffer and a separately capped 360-pixel-wide fog buffer. A portrait-tablet check confirmed that the compact solid buffer stays below the 1.5-million-pixel limit. The scene cache remained unchanged during ambient motion at the dense-display setting.

A separate recovery check emulated data saver before application initialization, verified a settled static start and explicit resume, forced WebGL context loss, then verified Retry 3D returned to one live canvas. The development editor was reopened afterward. Formatting, lint, type checking, the standalone release build and the production access gate passed. The browser receipts are summarized in [hero-validation.json](hero-validation.json); detailed screenshots and scripts remain in the ignored local design workspace.

Physical iPhone/Android qualification, sustained thermal measurements and broader Safari/Firefox checks remain outside the local Chromium evidence. Public deployment is separate from committing or pushing the source.
