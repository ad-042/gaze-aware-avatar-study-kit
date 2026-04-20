import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";

interface Vec3 { x: number; y: number; z: number }

/**
 * Applies a relaxed arm rest pose to a VRM avatar.
 *
 * Many VRM models default to a T-pose or A-pose. This controller
 * lowers the arms to a natural resting position by detecting the
 * correct rotation direction per model, then replaying the captured
 * raw arm rotations each frame in postUpdate() (after vrm.update()
 * resets the raw bones).
 *
 * Body idle motion (breathing, sway, head micro-motion) is now
 * handled by the VRMA idle animation (idle_loop.vrma) played through
 * the AnimationMixer in AvatarLoader.
 */
export class IdleMotionController {
  private readonly rawLeftUpperArm: THREE.Object3D | null = null;
  private readonly rawRightUpperArm: THREE.Object3D | null = null;
  private readonly rawLeftLowerArm: THREE.Object3D | null = null;
  private readonly rawRightLowerArm: THREE.Object3D | null = null;

  /** Full target rotations captured from the normalized→raw transfer. */
  private targetLeftUpperArm: Vec3 = { x: 0, y: 0, z: 0 };
  private targetRightUpperArm: Vec3 = { x: 0, y: 0, z: 0 };
  private targetLeftLowerArm: Vec3 = { x: 0, y: 0, z: 0 };
  private targetRightLowerArm: Vec3 = { x: 0, y: 0, z: 0 };

  private readonly hasArms: boolean;

  constructor(vrm: VRM) {
    const h = vrm.humanoid;
    if (!h) {
      this.hasArms = false;
      return;
    }

    const normLUA = h.getNormalizedBoneNode("leftUpperArm");
    const normRUA = h.getNormalizedBoneNode("rightUpperArm");
    const normLLA = h.getNormalizedBoneNode("leftLowerArm");
    const normRLA = h.getNormalizedBoneNode("rightLowerArm");

    this.rawLeftUpperArm = h.getRawBoneNode("leftUpperArm");
    this.rawRightUpperArm = h.getRawBoneNode("rightUpperArm");
    this.rawLeftLowerArm = h.getRawBoneNode("leftLowerArm");
    this.rawRightLowerArm = h.getRawBoneNode("rightLowerArm");

    const rawLLA = this.rawLeftLowerArm;
    this.hasArms = !!(normLUA && rawLLA);

    if (!this.hasArms) return;

    // Detect arm-lowering sign: apply a test rotation and check world Y.
    const tmpVec = new THREE.Vector3();

    vrm.scene.updateMatrixWorld(true);
    const restY = rawLLA!.getWorldPosition(tmpVec).y;

    normLUA!.rotation.set(0, 0, 1.0);
    h.update();
    vrm.scene.updateMatrixWorld(true);
    const testY = rawLLA!.getWorldPosition(tmpVec).y;

    const sign = testY < restY ? 1 : -1;

    normLUA!.rotation.set(0, 0, 0);

    // Set desired rest pose on normalized arm bones with detected sign
    const upperAngle = sign * 1.05;
    const lowerAngle = sign * 0.12;

    if (normLUA) normLUA.rotation.set(0, 0, upperAngle);
    if (normRUA) normRUA.rotation.set(0, 0, -upperAngle);
    if (normLLA) normLLA.rotation.set(0, 0, lowerAngle);
    if (normRLA) normRLA.rotation.set(0, 0, -lowerAngle);

    // Transfer normalized → raw
    h.update();
    vrm.scene.updateMatrixWorld(true);

    // Capture full (x,y,z) raw rotations
    if (this.rawLeftUpperArm) {
      const r = this.rawLeftUpperArm.rotation;
      this.targetLeftUpperArm = { x: r.x, y: r.y, z: r.z };
    }
    if (this.rawRightUpperArm) {
      const r = this.rawRightUpperArm.rotation;
      this.targetRightUpperArm = { x: r.x, y: r.y, z: r.z };
    }
    if (this.rawLeftLowerArm) {
      const r = this.rawLeftLowerArm.rotation;
      this.targetLeftLowerArm = { x: r.x, y: r.y, z: r.z };
    }
    if (this.rawRightLowerArm) {
      const r = this.rawRightLowerArm.rotation;
      this.targetRightLowerArm = { x: r.x, y: r.y, z: r.z };
    }

    // Reset normalized arm bones to identity — postUpdate() handles raw.
    if (normLUA) normLUA.rotation.set(0, 0, 0);
    if (normRUA) normRUA.rotation.set(0, 0, 0);
    if (normLLA) normLLA.rotation.set(0, 0, 0);
    if (normRLA) normRLA.rotation.set(0, 0, 0);
  }

  /**
   * Call once per frame, AFTER vrm.update().
   * Overrides raw arm bone rotations with the captured rest pose.
   */
  postUpdate(): void {
    if (!this.hasArms) return;

    if (this.rawLeftUpperArm) {
      const t = this.targetLeftUpperArm;
      this.rawLeftUpperArm.rotation.set(t.x, t.y, t.z);
    }
    if (this.rawRightUpperArm) {
      const t = this.targetRightUpperArm;
      this.rawRightUpperArm.rotation.set(t.x, t.y, t.z);
    }
    if (this.rawLeftLowerArm) {
      const t = this.targetLeftLowerArm;
      this.rawLeftLowerArm.rotation.set(t.x, t.y, t.z);
    }
    if (this.rawRightLowerArm) {
      const t = this.targetRightLowerArm;
      this.rawRightLowerArm.rotation.set(t.x, t.y, t.z);
    }
  }

  dispose(): void {
    // No owned resources — bone references belong to the VRM scene.
  }
}
