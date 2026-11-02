import {
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

type SocialId = "github" | "x" | "linkedin";

/** Physical plaques carry faithful flat brand artwork, with no altered silhouettes. */
export async function createSocialPlinths(model: Object3D, signal: AbortSignal) {
  const slab = model.getObjectByName("BasaltMonolith");
  if (!slab) throw new Error("The social plaques require the authored stone slab.");
  const group = new Group();
  group.name = "KELDSocialPlaques";
  const anchors: Array<{ id: SocialId; node: Object3D; size: number }> = [];
  const entries: Array<{ node: Group; rest: Vector3; orientation: Quaternion }> = [];
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
    const ids: SocialId[] = ["github", "x", "linkedin"];
    model.updateMatrixWorld(true);
    const parentRotation = slab.getWorldQuaternion(new Quaternion()).invert();
    const orientation = parentRotation
      .clone()
      .multiply(new Quaternion().setFromEuler(new Euler(-0.25, 0, 0)));
    for (const [index, id] of ids.entries()) {
      const texture = await loadMark(id);
      const badge = new Group();
      badge.name = `SocialPlaque_${id}`;
      const rest = slab.worldToLocal(new Vector3(3.1 + index * 0.8, 1.519, 2.5));
      badge.position.copy(rest);
      badge.quaternion.copy(orientation);
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
      anchors.push({ id, node: badge, size: 0.5 });
      entries.push({ node: badge, rest, orientation: orientation.clone() });
    }
    signal.throwIfAborted();
    slab.add(group);
    group.updateMatrixWorld(true);
    return {
      group,
      anchors,
      setReveal(progress: number) {
        if (disposed) return;
        entries.forEach(({ node, rest, orientation: rotation }, index) => {
          const t = Math.max(0, Math.min(1, (progress - index * 0.09) / 0.82));
          const eased = 1 - (1 - t) ** 3;
          node.visible = t > 0;
          node.position.copy(rest);
          node.position.y += (1 - eased) * 0.18;
          node.scale.setScalar(Math.max(0.001, eased));
          node.quaternion.copy(rotation);
          node.rotateX((1 - eased) * -0.12);
        });
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
