import {
  type Material,
  Mesh,
  type Object3D,
  type PerspectiveCamera,
  Texture,
  Vector3,
} from "three";

/** Dispose shared glTF resources once, including decoded image bitmaps. */
export function disposeModel(root: Object3D) {
  const geometries = new Set<Mesh["geometry"]>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      Object.values(material).forEach((value: unknown) => {
        if (value instanceof Texture) textures.add(value);
      });
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => {
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap)
      texture.image.close();
    texture.dispose();
  });
}

const point = new Vector3();

/** Native anchors retain keyboard/touch semantics over the actual 3D plaques. */
export function projectSocialLinks(
  host: HTMLElement | undefined,
  anchors: Array<{ id: string; node: Object3D; size: number }> | undefined,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  revealed: boolean,
) {
  if (!host || !anchors) return;
  for (const anchor of anchors) {
    const link = host.querySelector<HTMLElement>(`[data-social="${anchor.id}"]`);
    if (!link) continue;
    anchor.node.getWorldPosition(point).project(camera);
    const depth = point.z;
    let left = Infinity,
      right = -Infinity,
      top = Infinity,
      bottom = -Infinity;
    for (const dx of [-1, 1])
      for (const dy of [-1, 1]) {
        point.set(dx * anchor.size * 0.5, dy * anchor.size * 0.5, 0.05);
        anchor.node.localToWorld(point).project(camera);
        const px = (point.x * 0.5 + 0.5) * width;
        const py = (-point.y * 0.5 + 0.5) * height;
        left = Math.min(left, px);
        right = Math.max(right, px);
        top = Math.min(top, py);
        bottom = Math.max(bottom, py);
      }
    const x = (left + right) * 0.5,
      y = (top + bottom) * 0.5;
    const targetWidth = Math.max(48, right - left + 4);
    const targetHeight = Math.max(48, bottom - top + 4);
    const shown =
      revealed && depth > -1 && depth < 1 && x > 24 && x < width - 24 && y > 24 && y < height - 24;
    link.style.width = `${targetWidth}px`;
    link.style.height = `${targetHeight}px`;
    link.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    link.style.visibility = shown ? "visible" : "hidden";
    link.tabIndex = shown ? 0 : -1;
  }
}
