/**
 * Facade for expression + motion control.
 *
 * Ported from pixiv/ChatVRM.
 * Original: src/features/emoteController/emoteController.ts
 *
 * Adaptations:
 * - Camera/AutoLookAt dependency removed
 * - Adapted for @pixiv/three-vrm 3.5.x
 */

import type { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { ExpressionController } from "./expressionController.js";

export class EmoteController {
  private _expressionController: ExpressionController;

  constructor(vrm: VRM) {
    this._expressionController = new ExpressionController(vrm);
  }

  public playEmotion(preset: VRMExpressionPresetName): void {
    this._expressionController.playEmotion(preset);
  }

  public lipSync(preset: VRMExpressionPresetName, value: number): void {
    this._expressionController.lipSync(preset, value);
  }

  public update(delta: number): void {
    this._expressionController.update(delta);
  }
}
