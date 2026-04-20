/**
 * Convenience loader for .vrma files (VRMC_vrm_animation).
 *
 * Ported from pixiv/ChatVRM.
 * Original: src/lib/VRMAnimation/loadVRMAnimation.ts
 *
 * Adapted for three 0.183.
 */

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMAnimation } from "./VRMAnimation.js";
import { VRMAnimationLoaderPlugin } from "./VRMAnimationLoaderPlugin.js";

const loader = new GLTFLoader();
loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

export async function loadVRMAnimation(
  url: string,
): Promise<VRMAnimation | null> {
  const gltf = await loader.loadAsync(url);

  const vrmAnimations: VRMAnimation[] = gltf.userData.vrmAnimations;
  const vrmAnimation: VRMAnimation | undefined = vrmAnimations?.[0];

  return vrmAnimation ?? null;
}
