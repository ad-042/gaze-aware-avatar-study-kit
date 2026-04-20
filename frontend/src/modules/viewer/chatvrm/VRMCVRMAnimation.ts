/**
 * Type definition for the VRMC_vrm_animation glTF extension.
 *
 * Ported from pixiv/ChatVRM.
 * Original: src/lib/VRMAnimation/VRMCVRMAnimation.ts
 *
 * Adapted for @pixiv/three-vrm 3.5.x.
 */

import type {
  VRMExpressionPresetName,
  VRMHumanBoneName,
} from "@pixiv/three-vrm";

export interface VRMCVRMAnimation {
  specVersion: string;
  humanoid: {
    humanBones: {
      [name in VRMHumanBoneName]?: {
        node: number;
      };
    };
  };
  expressions?: {
    preset?: {
      [name in VRMExpressionPresetName]?: {
        node: number;
      };
    };
    custom?: {
      [name: string]: {
        node: number;
      };
    };
  };
  lookAt?: {
    node: number;
  };
}
