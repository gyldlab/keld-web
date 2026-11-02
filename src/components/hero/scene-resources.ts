import {
  type Material,
  Mesh,
  type Object3D,
  type PerspectiveCamera,
  Raycaster,
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
const worldCenter = new Vector3();
const cameraPosition = new Vector3();
const direction = new Vector3();
const normal = new Vector3();
const raycaster = new Raycaster();

function visibleInHierarchy(object: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function belongsTo(object: Object3D, parent: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (current === parent) return true;
  }
  return false;
}

function occluded(node: Object3D, occluders: Mesh[] | undefined, distance: number): boolean {
  if (!occluders) return false;
  raycaster.set(cameraPosition, direction);
  raycaster.near = 0.001;
  raycaster.far = Math.max(0.001, distance - 0.005);
  return raycaster.intersectObjects(occluders, false).some(({ object }) => {
    if (!(object instanceof Mesh) || belongsTo(object, node) || !visibleInHierarchy(object))
      return false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    return materials.some(
      (material) => material.visible && !material.transparent && material.opacity > 0.95,
    );
  });
}

/** Native anchors retain keyboard/touch semantics over the actual 3D plaques. */
export function projectSocialLinks(
  host: HTMLElement | undefined,
  anchors:
    | Array<{
        id: string;
        isInteractive?: () => boolean;
        node: Object3D;
        occluders?: Mesh[];
        size: number;
      }>
    | undefined,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  revealed: boolean,
) {
  if (!host || !anchors) return;
  camera.getWorldPosition(cameraPosition);
  for (const anchor of anchors) {
    const link = host.querySelector<HTMLElement>(`[data-social="${anchor.id}"]`);
    if (!link) continue;
    worldCenter.set(0, 0, 0.05);
    anchor.node.localToWorld(worldCenter);
    point.copy(worldCenter).project(camera);
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
    direction.subVectors(worldCenter, cameraPosition);
    const distance = direction.length();
    direction.normalize();
    normal.set(0, 0, 1).transformDirection(anchor.node.matrixWorld);
    const shown =
      revealed &&
      (anchor.isInteractive?.() ?? true) &&
      visibleInHierarchy(anchor.node) &&
      depth > -1 &&
      depth < 1 &&
      x > 24 &&
      x < width - 24 &&
      y > 24 &&
      y < height - 24 &&
      Number.isFinite(targetWidth) &&
      Number.isFinite(targetHeight) &&
      normal.dot(direction) < -0.01 &&
      !occluded(anchor.node, anchor.occluders, distance);
    link.style.width = `${targetWidth}px`;
    link.style.height = `${targetHeight}px`;
    link.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    link.style.visibility = shown ? "visible" : "hidden";
    link.style.pointerEvents = shown ? "auto" : "none";
    link.setAttribute("aria-hidden", shown ? "false" : "true");
    link.tabIndex = shown ? 0 : -1;
    if (!shown && document.activeElement === link) link.blur();
  }
}
