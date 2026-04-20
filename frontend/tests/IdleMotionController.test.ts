import { describe, it, expect, vi } from "vitest";
import { IdleMotionController } from "../src/modules/viewer/IdleMotionController.js";
import type { VRM } from "@pixiv/three-vrm";

/* ------------------------------------------------------------------ */
/*  Mock helpers                                                       */
/* ------------------------------------------------------------------ */

function makeBone(x = 0, y = 0, z = 0) {
  // World Y position: simulate arm going down with positive Z (sign=+1)
  // or down with negative Z (sign=-1) based on worldYDelta.
  let _worldYBase = 1.5; // default "rest" Y
  let _worldYDelta = 0;  // changed by rotation
  return {
    rotation: {
      x,
      y,
      z,
      order: "XYZ",
      set(nx: number, ny: number, nz: number) {
        this.x = nx;
        this.y = ny;
        this.z = nz;
      },
    },
    getWorldPosition(target: { x: number; y: number; z: number }) {
      target.x = 0.5;
      target.y = _worldYBase + _worldYDelta;
      target.z = 0;
      return target;
    },
    // Test helper: set world Y delta to simulate arm movement
    _setWorldYDelta(d: number) { _worldYDelta = d; },
  };
}

type MockBone = ReturnType<typeof makeBone>;

/**
 * Build a mock VRM whose humanoid.update() simulates the normalised→raw
 * transfer for the arm bones, and whose scene.updateMatrixWorld() is a no-op.
 *
 * @param armGoesDownWithPositiveZ  true  → positive norm Z lowers the arm
 *                                  false → negative norm Z lowers the arm
 */
function createMockVRM(armGoesDownWithPositiveZ: boolean) {
  const normBones: Record<string, MockBone> = {
    spine: makeBone(),
    chest: makeBone(),
    leftUpperArm: makeBone(),
    rightUpperArm: makeBone(),
    leftLowerArm: makeBone(),
    rightLowerArm: makeBone(),
  };

  const rawBones: Record<string, MockBone> = {
    leftUpperArm: makeBone(),
    rightUpperArm: makeBone(),
    leftLowerArm: makeBone(),
    rightLowerArm: makeBone(),
  };

  const humanoid = {
    getNormalizedBoneNode(name: string) {
      return normBones[name] ?? null;
    },
    getRawBoneNode(name: string) {
      return rawBones[name] ?? null;
    },
    update() {
      // Transfer normalized → raw for all arm bones
      const armNames = [
        "leftUpperArm",
        "rightUpperArm",
        "leftLowerArm",
        "rightLowerArm",
      ] as const;
      for (const name of armNames) {
        const norm = normBones[name];
        const raw = rawBones[name];
        raw.rotation.x = norm.rotation.x;
        raw.rotation.y = norm.rotation.y;
        raw.rotation.z = norm.rotation.z;
      }
      // Simulate world Y position change for leftLowerArm based on sign
      const normZ = normBones.leftUpperArm.rotation.z;
      if (normZ !== 0) {
        const yDelta = armGoesDownWithPositiveZ
          ? -Math.abs(normZ) * 0.5  // positive Z → Y goes down
          : Math.abs(normZ) * 0.5 * Math.sign(normZ); // positive Z → Y goes up
        rawBones.leftLowerArm._setWorldYDelta(yDelta);
      } else {
        rawBones.leftLowerArm._setWorldYDelta(0);
      }
    },
  };

  const scene = {
    updateMatrixWorld: vi.fn(),
  };

  return {
    vrm: { humanoid, scene } as unknown as VRM,
    normBones,
    rawBones,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("IdleMotionController", () => {
  // --- 1. Positive Z lowers arm (like Character B / male) ---

  it("uses positive Z when that direction lowers the arm", () => {
    const mock = createMockVRM(true);
    const ctrl = new IdleMotionController(mock.vrm);

    // Normalized arm bones should be reset to identity
    expect(mock.normBones.leftUpperArm.rotation.z).toBe(0);

    // postUpdate should write captured rotations to raw bones
    ctrl.postUpdate();

    // For this mock: positive Z = down, so upper arm Z ≈ +1.05
    expect(mock.rawBones.leftUpperArm.rotation.z).toBeCloseTo(1.05, 1);
    expect(mock.rawBones.rightUpperArm.rotation.z).toBeCloseTo(-1.05, 1);
    expect(mock.rawBones.leftLowerArm.rotation.z).toBeCloseTo(0.12, 1);
    expect(mock.rawBones.rightLowerArm.rotation.z).toBeCloseTo(-0.12, 1);
  });

  // --- 2. Negative Z lowers arm (like Character A / female) ---

  it("uses negative Z when positive Z raises the arm", () => {
    const mock = createMockVRM(false);
    const ctrl = new IdleMotionController(mock.vrm);

    // Normalized arm bones should be reset to identity
    expect(mock.normBones.leftUpperArm.rotation.z).toBe(0);

    // postUpdate should write captured rotations with flipped sign
    ctrl.postUpdate();

    // For this mock: negative Z = down, so upper arm Z ≈ -1.05
    expect(mock.rawBones.leftUpperArm.rotation.z).toBeCloseTo(-1.05, 1);
    expect(mock.rawBones.rightUpperArm.rotation.z).toBeCloseTo(1.05, 1);
    expect(mock.rawBones.leftLowerArm.rotation.z).toBeCloseTo(-0.12, 1);
    expect(mock.rawBones.rightLowerArm.rotation.z).toBeCloseTo(0.12, 1);
  });

  // --- 3. All normalized arm bones reset to identity ---

  it("resets all normalized arm bones to identity after capture", () => {
    const mock = createMockVRM(true);
    new IdleMotionController(mock.vrm);

    for (const name of [
      "leftUpperArm",
      "rightUpperArm",
      "leftLowerArm",
      "rightLowerArm",
    ] as const) {
      expect(mock.normBones[name].rotation.x).toBe(0);
      expect(mock.normBones[name].rotation.y).toBe(0);
      expect(mock.normBones[name].rotation.z).toBe(0);
    }
  });

  // --- 4. postUpdate is a no-op when no arms ---

  it("postUpdate is a no-op when humanoid has no arms", () => {
    const vrm = { humanoid: null } as unknown as VRM;
    const ctrl = new IdleMotionController(vrm);

    // Should not throw
    ctrl.postUpdate();
  });

  // --- 5. No humanoid — graceful no-op ---

  it("handles missing humanoid without crashing", () => {
    const vrm = { humanoid: null } as unknown as VRM;
    const ctrl = new IdleMotionController(vrm);

    // Should not throw
    ctrl.postUpdate();
    ctrl.dispose();
  });
});
