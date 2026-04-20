/**
 * Manages VRM facial expressions, emotion presets, and lip-sync blending.
 *
 * Ported from pixiv/ChatVRM.
 * Original: src/features/emoteController/expressionController.ts
 *
 * Adaptations:
 * - AutoLookAt dependency removed (project has its own lookAt system)
 * - Adapted for @pixiv/three-vrm 3.5.x
 */

import type {
  VRM,
  VRMExpressionManager,
  VRMExpressionPresetName,
} from "@pixiv/three-vrm";
import { AutoBlink } from "./autoBlink.js";

export class ExpressionController {
  private _autoBlink?: AutoBlink;
  private _expressionManager?: VRMExpressionManager;
  private _currentEmotion: VRMExpressionPresetName;
  private _currentLipSync: {
    preset: VRMExpressionPresetName;
    value: number;
  } | null;

  constructor(vrm: VRM) {
    this._currentEmotion = "neutral";
    this._currentLipSync = null;
    if (vrm.expressionManager) {
      this._expressionManager = vrm.expressionManager;
      this._autoBlink = new AutoBlink(vrm.expressionManager);
    }
  }

  public playEmotion(preset: VRMExpressionPresetName): void {
    if (this._currentEmotion !== "neutral") {
      this._expressionManager?.setValue(this._currentEmotion, 0);
    }

    if (preset === "neutral") {
      this._autoBlink?.setEnable(true);
      this._currentEmotion = preset;
      return;
    }

    const t = this._autoBlink?.setEnable(false) ?? 0;
    this._currentEmotion = preset;
    setTimeout(() => {
      this._expressionManager?.setValue(preset, 1);
    }, t * 1000);
  }

  public lipSync(preset: VRMExpressionPresetName, value: number): void {
    if (this._currentLipSync) {
      this._expressionManager?.setValue(this._currentLipSync.preset, 0);
    }
    this._currentLipSync = { preset, value };
  }

  public update(delta: number): void {
    if (this._autoBlink) {
      this._autoBlink.update(delta);
    }

    if (this._currentLipSync) {
      const weight =
        this._currentEmotion === "neutral"
          ? this._currentLipSync.value * 0.5
          : this._currentLipSync.value * 0.25;
      this._expressionManager?.setValue(this._currentLipSync.preset, weight);
    }
  }
}
