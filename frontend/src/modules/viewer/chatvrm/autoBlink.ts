/**
 * Binary auto-blink controller.
 *
 * Ported from pixiv/ChatVRM.
 * Original: src/features/emoteController/autoBlink.ts
 *
 * Coordinates with the expression system: when an emotion expression
 * is active, auto-blink can be disabled to avoid interference.
 * setEnable() returns the remaining close-time so the caller can
 * delay the emotion application until the eyes are open.
 *
 * Adapted for @pixiv/three-vrm 3.5.x.
 */

import type { VRMExpressionManager } from "@pixiv/three-vrm";
import { BLINK_CLOSE_MAX, BLINK_OPEN_MAX } from "./emoteConstants.js";

export class AutoBlink {
  private _expressionManager: VRMExpressionManager;
  private _remainingTime: number;
  private _isOpen: boolean;
  private _isAutoBlink: boolean;

  constructor(expressionManager: VRMExpressionManager) {
    this._expressionManager = expressionManager;
    this._remainingTime = 0;
    this._isAutoBlink = true;
    this._isOpen = true;
  }

  /**
   * Enable or disable auto-blink.
   *
   * Returns the remaining time (seconds) until the eyes open.
   * Callers should wait this long before applying emotion expressions
   * to avoid the unnatural look of an emotion starting mid-blink.
   */
  public setEnable(isAuto: boolean): number {
    this._isAutoBlink = isAuto;

    if (!this._isOpen) {
      return this._remainingTime;
    }

    return 0;
  }

  public update(delta: number): void {
    if (this._remainingTime > 0) {
      this._remainingTime -= delta;
      return;
    }

    if (this._isOpen && this._isAutoBlink) {
      this.close();
      return;
    }

    this.open();
  }

  private close(): void {
    this._isOpen = false;
    this._remainingTime = BLINK_CLOSE_MAX;
    this._expressionManager.setValue("blink", 1);
  }

  private open(): void {
    this._isOpen = true;
    this._remainingTime = BLINK_OPEN_MAX;
    this._expressionManager.setValue("blink", 0);
  }
}
