/**
 * ChatVRM-derived behavior modules.
 *
 * Ported from pixiv/ChatVRM (MIT) and adapted for three 0.183 /
 * @pixiv/three-vrm 3.5.x / TypeScript 5.x.
 *
 * All modules are active in the runtime path.
 */

// LookAt smoothing
export { VRMLookAtSmoother, SACCADE_PROFILES } from "./VRMLookAtSmoother.js";
export type { SaccadeProfile } from "./VRMLookAtSmoother.js";
export { VRMLookAtSmootherLoaderPlugin } from "./VRMLookAtSmootherLoaderPlugin.js";

// VRM Animation (.vrma) pipeline
export { VRMAnimation } from "./VRMAnimation.js";
export { VRMAnimationLoaderPlugin } from "./VRMAnimationLoaderPlugin.js";
export type { VRMAnimationLoaderPluginOptions } from "./VRMAnimationLoaderPluginOptions.js";
export type { VRMCVRMAnimation } from "./VRMCVRMAnimation.js";
export { loadVRMAnimation } from "./loadVRMAnimation.js";

// Emote / expression / blink
export { AutoBlink } from "./autoBlink.js";
export { ExpressionController } from "./expressionController.js";
export { EmoteController } from "./emoteController.js";
export { BLINK_CLOSE_MAX, BLINK_OPEN_MAX } from "./emoteConstants.js";

// Lip sync
export { LipSync } from "./lipSync.js";
export type { LipSyncAnalyzeResult } from "./lipSyncAnalyzeResult.js";

// Runtime glue
export { ChatVrmAvatarRuntime } from "./ChatVrmAvatarRuntime.js";
