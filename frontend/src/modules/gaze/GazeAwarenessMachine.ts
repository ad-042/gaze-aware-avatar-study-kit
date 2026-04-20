import type { GazeProfile } from "../../shared/types.js";

/**
 * FSM states for gaze awareness.
 *
 * baseline          – no mutual gaze detected
 * gazeaware_pending – gaze on face, waiting for dwell threshold
 * gazeaware         – mutual gaze confirmed
 * gaze_break        – forced look-away after sustained mutual gaze
 */
export type GazeState =
  | "baseline"
  | "gazeaware_pending"
  | "gazeaware"
  | "gaze_break";

/**
 * Gaze awareness finite state machine.
 *
 * Pure logic — no DOM, no rendering, no side effects.
 * Timing parameters come from a GazeProfile (config-driven).
 *
 * Call `update(isIntersecting, now)` once per frame.
 * Read `state` for the current FSM state and `isAware` for the
 * boolean output (true = avatar should look at user).
 */
export class GazeAwarenessMachine {
  private _state: GazeState = "baseline";
  private _accumulated = 0;
  private _lastTimestamp: number | null = null;
  private _gazeLostTimestamp: number | null = null;

  private readonly pendingTime: number;
  private readonly mutualTime: number;
  private readonly breakTime: number;
  private readonly loseDebounce: number;

  constructor(profile: GazeProfile) {
    this.pendingTime = profile.pending_time_ms;
    this.mutualTime = profile.mutual_time_ms;
    this.breakTime = profile.break_time_ms;
    this.loseDebounce = profile.lose_debounce_ms;
  }

  /** Current FSM state. */
  get state(): GazeState {
    return this._state;
  }

  /** Whether the avatar should look at the user right now. */
  get isAware(): boolean {
    return this._state === "gazeaware";
  }

  /** Reset to baseline (e.g. on step change). */
  reset(): void {
    this._state = "baseline";
    this._accumulated = 0;
    this._lastTimestamp = null;
    this._gazeLostTimestamp = null;
  }

  /**
   * Advance the FSM by one tick.
   *
   * @param isIntersecting - Whether gaze currently hits the face bounding box.
   * @param now - Current timestamp in milliseconds (e.g. performance.now()).
   */
  update(isIntersecting: boolean, now: number): void {
    switch (this._state) {
      case "baseline":
        this.updateBaseline(isIntersecting, now);
        break;
      case "gazeaware_pending":
        this.updatePending(isIntersecting, now);
        break;
      case "gazeaware":
        this.updateGazeaware(isIntersecting, now);
        break;
      case "gaze_break":
        this.updateBreak(isIntersecting, now);
        break;
    }
  }

  // --- State handlers ---

  private enterState(next: GazeState, now: number): void {
    this._state = next;
    this._accumulated = 0;
    this._lastTimestamp = now;
    this._gazeLostTimestamp = null;
  }

  private updateBaseline(isIntersecting: boolean, now: number): void {
    if (isIntersecting) {
      this.enterState("gazeaware_pending", now);
    }
  }

  private updatePending(isIntersecting: boolean, now: number): void {
    if (isIntersecting) {
      this._gazeLostTimestamp = null;
      const dt = this._lastTimestamp !== null ? now - this._lastTimestamp : 0;
      this._accumulated += dt;
      this._lastTimestamp = now;

      if (this._accumulated >= this.pendingTime) {
        this.enterState("gazeaware", now);
      }
    } else {
      // Debounce: tolerate brief gaze loss
      if (this._gazeLostTimestamp === null) {
        this._gazeLostTimestamp = now;
      }
      if (now - this._gazeLostTimestamp >= this.loseDebounce) {
        this.enterState("baseline", now);
      }
    }
  }

  private updateGazeaware(isIntersecting: boolean, now: number): void {
    if (isIntersecting) {
      this._gazeLostTimestamp = null;
      const dt = this._lastTimestamp !== null ? now - this._lastTimestamp : 0;
      this._accumulated += dt;
      this._lastTimestamp = now;

      if (this._accumulated >= this.mutualTime) {
        this.enterState("gaze_break", now);
      }
    } else {
      // Debounce: keep isAware=true during debounce window
      if (this._gazeLostTimestamp === null) {
        this._gazeLostTimestamp = now;
      }
      if (now - this._gazeLostTimestamp >= this.loseDebounce) {
        this.enterState("baseline", now);
      }
    }
  }

  private updateBreak(isIntersecting: boolean, now: number): void {
    const dt = this._lastTimestamp !== null ? now - this._lastTimestamp : 0;
    this._accumulated += dt;
    this._lastTimestamp = now;

    if (this._accumulated >= this.breakTime) {
      // If still looking at face after break, skip baseline
      if (isIntersecting) {
        this.enterState("gazeaware_pending", now);
      } else {
        this.enterState("baseline", now);
      }
    }
  }
}
