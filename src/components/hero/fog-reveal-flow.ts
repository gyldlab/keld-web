import { Euler, MathUtils, Matrix4, Quaternion, Vector3, Vector4 } from "three";

const angles = [0.2, 1.7, 3.35, 4.8];
const turns = [2.1, 2.65, 1.85, 2.4];
const radii = [1.9, 2.6, 2.3, 1.75];
const sizes = [1.0, 1.12, 0.92, 1.06];

/** Four finite 3D smoke volumes travel from the viewing position past the mark. */
export class FogRevealFlow {
  readonly boundsMin = new Vector3(-8, 0, -12);
  readonly boundsMax = new Vector3(12, 6.5, 1.2);
  readonly inverseTransforms = Array.from({ length: 4 }, () => new Matrix4());
  readonly weights = new Vector4();
  readonly centers = Array.from({ length: 4 }, () => new Vector3());
  private eye = new Vector3();
  private target = new Vector3(2.55, 2.7, 0.1);
  private axis = new Vector3();
  private right = new Vector3();
  private up = new Vector3();
  private frame = new Matrix4();
  private frameRotation = new Quaternion();
  private rotation = new Quaternion();
  private euler = new Euler();
  private scale = new Vector3();
  private extent = new Vector3();
  private corner = new Vector3();
  private world = new Matrix4();
  private launch = 8;
  private progress = 1;

  constructor() {
    this.setView([5.2, 2.9, 12.035]);
  }

  setView(position: readonly number[]) {
    if (this.eye.x === position[0] && this.eye.y === position[1] && this.eye.z === position[2])
      return;
    this.eye.fromArray(position);
    this.axis.subVectors(this.eye, this.target);
    const distance = this.axis.length();
    if (distance < 0.0001) this.axis.set(0, 0, 1);
    else this.axis.divideScalar(distance);
    this.right.set(0, 1, 0).cross(this.axis);
    if (this.right.lengthSq() < 0.001) this.right.set(1, 0, 0);
    else this.right.normalize();
    this.up.crossVectors(this.axis, this.right).normalize();
    this.frame.makeBasis(this.right, this.up, this.axis);
    this.frameRotation.setFromRotationMatrix(this.frame);
    this.launch = Math.max(0.1, distance - Math.min(2.5, distance * 0.45));
    this.update(this.progress);
  }

  update(progress: number) {
    this.progress = MathUtils.clamp(progress, 0, 1);
    this.boundsMin.set(-8, 0, -12);
    this.boundsMax.set(12, 6.5, 1.2);
    const fade = 1 - MathUtils.smoothstep(this.progress, 0.7, 0.9);
    this.weights.set(0, 0, 0, 0);
    if (fade <= 0) return;
    for (let i = 0; i < 4; i++) {
      const travel = MathUtils.smoothstep(this.progress, 0.015 + i * 0.025, 0.65 + i * 0.028);
      const depth = MathUtils.lerp(this.launch - i * 0.28, -3 - i * 0.35, travel);
      const angle = angles[i] + travel * turns[i];
      const radius = MathUtils.lerp(
        0.45 + i * 0.06,
        radii[i],
        MathUtils.smoothstep(travel, 0.12, 0.82),
      );
      const center = this.centers[i];
      center
        .copy(this.target)
        .addScaledVector(this.axis, depth)
        .addScaledVector(this.right, Math.cos(angle) * radius)
        .addScaledVector(this.up, Math.sin(angle) * radius * 0.8);
      this.euler.set(
        0.32 * Math.sin(angle),
        0.28 * Math.cos(angle + travel),
        angles[i] - travel * 1.7,
      );
      this.rotation.setFromEuler(this.euler).premultiply(this.frameRotation);
      this.scale.set(1.55, 1.22, 2.35).multiplyScalar(sizes[i]);
      this.world.compose(center, this.rotation, this.scale);
      this.inverseTransforms[i].copy(this.world).invert();
      this.weights.setComponent(i, fade * (i % 2 ? 0.95 : 0.8));
      // Exact axis-aligned extent of the transformed unit sphere.
      const m = this.world.elements;
      this.extent.set(
        Math.hypot(m[0], m[4], m[8]),
        Math.hypot(m[1], m[5], m[9]),
        Math.hypot(m[2], m[6], m[10]),
      );
      this.boundsMin.min(this.corner.copy(center).sub(this.extent));
      this.boundsMax.max(this.corner.copy(center).add(this.extent));
    }
    this.boundsMin.y = Math.max(0, this.boundsMin.y);
  }
}
