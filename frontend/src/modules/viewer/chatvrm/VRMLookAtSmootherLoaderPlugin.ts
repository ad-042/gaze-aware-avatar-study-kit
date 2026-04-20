/**
 * GLTFLoader plugin that replaces VRMLookAt with VRMLookAtSmoother.
 *
 * Ported from pixiv/ChatVRM.
 * Original: src/lib/VRMLookAtSmootherLoaderPlugin/VRMLookAtSmootherLoaderPlugin.ts
 *
 * Adapted for three 0.183 / @pixiv/three-vrm 3.5.x.
 */

import {
  VRMHumanoid,
  VRMLookAt,
  VRMLookAtLoaderPlugin,
} from "@pixiv/three-vrm";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { VRMLookAtSmoother } from "./VRMLookAtSmoother.js";

export class VRMLookAtSmootherLoaderPlugin extends VRMLookAtLoaderPlugin {
  public override get name(): string {
    return "VRMLookAtSmootherLoaderPlugin";
  }

  public override async afterRoot(gltf: GLTF): Promise<void> {
    await super.afterRoot(gltf);

    const humanoid = gltf.userData.vrmHumanoid as VRMHumanoid | null;
    const lookAt = gltf.userData.vrmLookAt as VRMLookAt | null;

    if (humanoid != null && lookAt != null) {
      const lookAtSmoother = new VRMLookAtSmoother(humanoid, lookAt.applier);
      lookAtSmoother.copy(lookAt);
      gltf.userData.vrmLookAt = lookAtSmoother;
    }
  }
}
