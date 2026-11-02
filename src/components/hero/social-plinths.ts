import {
  Euler,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Texture,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import type { SocialId, SocialTuning } from "@/components/hero/_types/scene-preset";
import { createDefaultSocialTuning, SOCIAL_IDS } from "@/components/hero/social-settings";

/** Physical plaques carry faithful flat brand artwork, with no altered silhouettes. */
export async function createSocialPlinths(model: Object3D, signal: AbortSignal) {
  const slab = model.getObjectByName("BasaltMonolith");
  if (!slab) throw new Error("The social plaques require the authored stone slab.");
  const group = new Group();
  group.name = "KELDSocialPlaques";
  const anchors: Array<{
    id: SocialId;
    isInteractive: () => boolean;
    node: Object3D;
    occluders: Mesh[];
    size: number;
  }> = [];
  const entries: Array<{ id: SocialId; node: Group; interactive: boolean }> = [];
  const occluders: Mesh[] = [];
  model.updateMatrixWorld(true);
  // Using the ORIGINAL inverse preserves attachment after later slab offsets.
  const authoredWorldToSlab = slab.matrixWorld.clone().invert();
  const authoredRotationInverse = slab.getWorldQuaternion(new Quaternion()).invert();
  const rotation = new Quaternion();
  const euler = new Euler();
  let settings = createDefaultSocialTuning();
  let compact = matchMedia("(max-width: 900px), (max-aspect-ratio: 1/1)").matches;
  let progress = 0;
  const textures: Texture[] = [];
  const faces: MeshBasicMaterial[] = [];
  const bodyGeometry = new RoundedBoxGeometry(0.5, 0.5, 0.09, 3, 0.035);
  const faceGeometry = new PlaneGeometry(0.34, 0.34);
  const bodyMaterial = new MeshStandardMaterial({
    color: "#182633",
    metalness: 0.72,
    roughness: 0.33,
    envMapIntensity: 0.65,
  });
  let disposed = false;
  function updatePlacement() {
    if (disposed) return;
    for (const entry of entries) {
      const value = settings[entry.id];
      const t = value.reveal.enabled
        ? MathUtils.clamp(
            (progress - value.reveal.start) / (value.reveal.end - value.reveal.start),
            0,
            1,
          )
        : 1;
      const eased = 1 - (1 - t) ** 3;
      entry.node.visible = value.enabled && (compact ? value.mobile : value.desktop) && t > 0;
      entry.interactive = entry.node.visible && eased >= 0.95;
      entry.node.position.fromArray(value.position).applyMatrix4(authoredWorldToSlab);
      entry.node.position.y += (1 - eased) * value.reveal.lift;
      entry.node.scale.setScalar(value.scale * Math.max(0.001, eased));
      euler.set(
        MathUtils.degToRad(value.rotation[0]),
        MathUtils.degToRad(value.rotation[1]),
        MathUtils.degToRad(value.rotation[2]),
      );
      rotation.setFromEuler(euler);
      entry.node.quaternion.copy(authoredRotationInverse).multiply(rotation);
      entry.node.rotateX((1 - eased) * MathUtils.degToRad(value.reveal.tilt));
    }
    group.updateMatrixWorld(true);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    textures.forEach((texture) => texture.dispose());
    faces.forEach((material) => material.dispose());
    bodyMaterial.dispose();
    bodyGeometry.dispose();
    faceGeometry.dispose();
  }

  async function loadMark(id: SocialId) {
    signal.throwIfAborted();
    const extension = id === "linkedin" ? "png" : "svg";
    const response = await fetch(`/brand/social/${id}.${extension}`, { signal });
    if (!response.ok) throw new Error(`The ${id} brand asset could not be loaded.`);
    const objectUrl = URL.createObjectURL(await response.blob());
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      signal.throwIfAborted();
      const texture = new Texture(image);
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      textures.push(texture);
      return texture;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  try {
    // Sequential tiny local assets keep abort/disposal ownership unambiguous.
    for (const id of SOCIAL_IDS) {
      const texture = await loadMark(id);
      const badge = new Group();
      badge.name = `SocialPlaque_${id}`;
      const body = new Mesh(bodyGeometry, bodyMaterial);
      body.castShadow = true;
      body.receiveShadow = true;
      badge.add(body);

      const material = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.02,
        depthWrite: false,
        toneMapped: false,
      });
      faces.push(material);
      const face = new Mesh(faceGeometry, material);
      const aspect = texture.image.naturalWidth / texture.image.naturalHeight;
      face.scale.set(Math.min(1, aspect), Math.min(1, 1 / aspect), 1);
      face.position.z = 0.047;
      face.name = `${id}_brand_face`;
      badge.add(face);
      group.add(badge);
      const entry = { id, node: badge, interactive: false };
      entries.push(entry);
      anchors.push({
        id,
        isInteractive: () => entry.interactive,
        node: badge,
        occluders,
        size: 0.5,
      });
    }
    signal.throwIfAborted();
    slab.add(group);
    model.traverse((node) => {
      if (node instanceof Mesh) occluders.push(node);
    });
    updatePlacement();
    return {
      group,
      anchors,
      configure(next: SocialTuning) {
        settings = structuredClone(next);
        updatePlacement();
      },
      setCompact(next: boolean) {
        compact = next;
        updatePlacement();
      },
      setReveal(next: number) {
        progress = MathUtils.clamp(next, 0, 1);
        updatePlacement();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
