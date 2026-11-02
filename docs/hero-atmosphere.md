# KELD hero: atmosphere, motion and editing

## Result and design intent

The hero combines the existing KELD assembly with a bounded volume of drifting fog, a soft mouse disturbance and three physical social plaques on the stone slab. The main mark remains the focal point. The fog provides depth behind it; the social marks appear late in the assembly and remain secondary.

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
5. Enlarge the fog image using neighboring depth values to reduce leakage at object edges. Combine it as `scene * transmittance + scatteredLight`.
6. Apply the existing output transform once. [Three.js color management](https://threejs.org/manual/pages/color-management.html) requires lighting calculations in its linear working color space. After display conversion, Three.js's FXAA pass (fast approximate anti-aliasing) smooths the final image's pixel edges, including edges introduced by atmosphere composition.

After assembly, scene geometry and the camera are normally unchanged. The scene color and depth are reused. Only the fog and final image composition need to update. A camera, material, light, object or viewport change invalidates the cached scene. Environment reflection captures are not repeated for ordinary fog motion.

Caching has limits: future continuously moving objects must invalidate the scene each frame. Animated volumetric fog is not included in the cached environment reflection. The development-only depth-of-field option can add scene work when enabled; the production default leaves it disabled.

## Cursor behavior and choreography

Pointer coordinates are projected onto a plane through the fog at world `z = -3`. The disturbance acts within a soft spatial radius. It combines rotation around the pointer, limited directional movement and slight local clearing. Pointer movement is damped; velocity is clamped. After movement stops, its strength decays exponentially. Touch scrolling is not intercepted to imitate a mouse.

The existing authored assembly is played once at a 0.7 time scale, taking approximately 2.29 seconds for the 1.6-second clip. The fog starts slightly denser and relaxes as assembly progresses. Social plaques reveal from roughly 55% through 95% of the clip, with a small stagger and gentle settling. The assembly does not loop; the ambient fog continues.

The pointer effect has no accumulated simulation history. This reduces memory and avoids stale motion trails after resize or camera changes. It also means the wake is localized: it is not a persistent fluid field advected across the whole scene.

## Production defaults and tuning

| Setting                 | Default / bound                                                | Reason                                                          |
| ----------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Fog color               | `#8eabc5`                                                      | Restrained cool atmosphere, consistent with the window light.   |
| Density                 | `0.065`; editor range `0–0.25`                                 | Keeps the mark and copy legible while allowing thicker studies. |
| Drift speed             | `1`; editor range `0–3`                                        | Adjusts the time scale of the density pattern.                  |
| Mouse response          | `1`; editor range `0–2`                                        | Allows interaction to be reduced or disabled.                   |
| Samples per ray         | 24 desktop, 16 compact                                         | Bounded work for a soft effect.                                 |
| Fog width               | At most 840 pixels desktop, 360 compact, also bounded by scale | Avoids tracing at full display resolution.                      |
| Main pixel ratio        | At most 1.5 desktop, 1.25 compact                              | Bounds large/high-density display work.                         |
| Ambient cadence         | Target 30 frames/second desktop, 24 compact                    | Slow fog does not require a full-speed geometry render loop.    |
| Slow-frame fallback     | 60% fog dimensions and 12 samples                              | Reduces work after sustained slow frames.                       |
| Hidden/offscreen/paused | No scheduled animation frames                                  | Avoids unnecessary continuing work.                             |

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

## Ownership and lifecycle

`atmosphere-pass.ts` owns its render targets, shaders and noise texture. `scene-motion.ts` owns the animation callback and input/preference listeners. `social-plinths.ts` owns shared plaque geometry, materials and brand textures. Disposal is idempotent. Async brand image loading checks cancellation and revokes temporary object URLs. Social meshes are removed before the original model disposal traverses its resources.

The rendering failure path stops the loop, releases owned resources and presents Retry 3D. A retry creates a fresh renderer. The page keeps its normal textual content and navigation even if WebGL is unavailable.

## Verification record

Final browser verification on Chromium with the Apple M4 Metal renderer measured approximately 30.3 ambient frames/second at 1440 × 900 and 24.0 at a 390-pixel viewport, over short 2.2-second observation windows. Those measurements are from the local desktop browser, including a compact viewport emulation; they are not a benchmark on a physical phone or a sustained thermal test.

Verified in the development environment: homepage editor and Scene Lab link; live fog editing and browser persistence; JSON export containing moving fog; import of a valid older preset; both editor routes. The release build and the HTTP production gate passed, including all three social artwork assets and 404 responses for both lab routes.

The production-browser check passed after the final edge-smoothing pass: the client has no Scene Lab; fog continues while scene/depth and reflection capture counts remain unchanged after assembly; cursor response rises and relaxes; social links are keyboard accessible; pause, offscreen state and a live reduced-motion change stop animation; 390- and 320-pixel layouts have no horizontal overflow. No page or console errors were reported in that normal interaction run. Desktop and compact screenshots were inspected; the social marks are visible and the mobile motion control does not cover them.

A separate recovery check emulated data saver before application initialization, verified a settled static start and explicit resume, forced WebGL context loss, then verified Retry 3D returned to one live canvas. The development editor was reopened afterward. Formatting, lint, type checking, the standalone release build and the production access gate passed. The browser receipts are summarized in [hero-validation.json](hero-validation.json); detailed screenshots and scripts remain in the ignored local design workspace.

Physical iPhone/Android qualification, sustained thermal measurements and broader Safari/Firefox checks remain outside the local Chromium evidence. Public deployment is separate from committing or pushing the source.
