# Asset credits and sources

The website's KELD and GYLDLAB brand marks and editable 3D scene were supplied
by the project owners. The site includes the generated `.glb` runtime scene
and SVG marks, not the local Blender archive or experimental renders.

## Stone materials

Four **Poly Haven** materials are available in the local Scene Lab's slab
selector: [Seaside Rock](https://polyhaven.com/a/seaside_rock),
[Dark Rock](https://polyhaven.com/a/dark_rock),
[Dark Rock 02](https://polyhaven.com/a/dark_rock_02) and
[Granular Concrete](https://polyhaven.com/a/granular_concrete).

These textures are distributed under [CC0 1.0](https://polyhaven.com/license).
The repository includes optimized 2K/1K color, 1K normal and 1K roughness WebP
copies for browser use. The original high-resolution source packs are preserved
outside the website repository.

## Hero atmosphere and social artwork

The moving fog uses a project-generated 32³ one-byte density texture and project
shader code. No smoke bitmap, VDB sequence or marketplace 3D logo is shipped.
Research references and the implementation decision are documented in
[Hero atmosphere and motion](docs/hero-atmosphere.md).

The three social plaques use shared project-authored geometry. Their front faces
use these locally served brand assets, retrieved 2 November 2026:

| Local asset                        | Source                                                                                                                                                                                 | Treatment / rights                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/brand/social/github.svg`   | [Official GitHub logo archive](https://brand.github.com/GitHub_Logos.zip), `GitHub Logos/SVG/GitHub_Invertocat_White.svg`                                                              | Original SVG; [GitHub brand guidelines](https://brand.github.com/foundations/logo). The mark links to the KELD project.                                                                                                                                                                                          |
| `public/brand/social/linkedin.png` | [Official LinkedIn in-logo archive](https://content.linkedin.com/content/dam/me/business/en-us/amp/xbu/linkedin-revised-brand-guidelines/logos/in-logo.zip), `in-logo/InBug-White.png` | Original 840 × 779 PNG; [LinkedIn social icon guidance](https://brand.linkedin.com/in-logo).                                                                                                                                                                                                                     |
| `public/brand/social/x.svg`        | [Simple Icons X source](https://github.com/simple-icons/simple-icons/blob/develop/icons/x.svg)                                                                                         | Unchanged path, explicit 256 × 256 rasterization size and white fill. Simple Icons is [CC0 1.0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md); [X brand guidelines](https://about.x.com/content/dam/about-twitter/x/brand-toolkit/x-brand-guidelines.pdf) remain applicable to the mark. |

The source archives remain in the ignored local design workspace. The combined
runtime artwork is approximately 12.5 KB, before network compression. Rendering
preserves each asset's aspect ratio. Brand marks do not inherit the plaque's
metallic shader. The logos identify outbound social links; they do not imply
endorsement. Brand and trademark rights remain with their respective owners.

SHA-256 of the delivered assets:

```text
github.svg   ccd84c89b1056345608fc3489357f8acc7397e49a3cdc2d418b6c8016911d47b
x.svg        fcdc7634c38c9606a4cb6e36dd9a1a2341b7f7ef86972a5e5c8535c274432dfa
linkedin.png ed22a5ab46c171e3449708ff34923de7298da00ac204c7f85444db05bf888791
```

## Third-party frontend code

- [Three.js](https://threejs.org/): realtime WebGL scene rendering.
- [Paper Shaders / Liquid Metal](https://github.com/paper-design/shaders):
  lazily loaded footer mark effect, with static SVG fallback.
- [lil-gui](https://lil-gui.georgealways.com/):
  the optional Scene Lab controls.

Runtime and package licenses are provided in their respective upstream
repositories. The licensing of these dependencies does not independently grant
permission to use the KELD or GYLDLAB branding.
