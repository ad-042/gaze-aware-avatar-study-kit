import { describe, it, expect, beforeEach } from "vitest";
import {
  GazeAwarenessMachine,
  type GazeState,
} from "../src/modules/gaze/GazeAwarenessMachine.js";
import type { GazeProfile } from "../src/shared/types.js";

const DEFAULT_PROFILE: GazeProfile = {
  states: ["baseline", "gazeaware_pending", "gazeaware", "gaze_break"],
  pending_time_ms: 300,
  mutual_time_ms: 3600,
  break_time_ms: 1250,
  lose_debounce_ms: 200,
};

function createFSM(overrides?: Partial<GazeProfile>): GazeAwarenessMachine {
  return new GazeAwarenessMachine({ ...DEFAULT_PROFILE, ...overrides });
}

/** Advance the FSM by calling update in small steps. */
function tickFor(
  fsm: GazeAwarenessMachine,
  ms: number,
  isIntersecting: boolean,
  startTime: number,
  stepMs = 16,
): number {
  let t = startTime;
  const end = startTime + ms;
  while (t < end) {
    t = Math.min(t + stepMs, end);
    fsm.update(isIntersecting, t);
  }
  return t;
}

describe("GazeAwarenessMachine", () => {
  let fsm: GazeAwarenessMachine;

  beforeEach(() => {
    fsm = createFSM();
  });

  // --- Initial state ---

  it("starts in baseline", () => {
    expect(fsm.state).toBe("baseline");
    expect(fsm.isAware).toBe(false);
  });

  // --- baseline → gazeaware_pending ---

  it("transitions to gazeaware_pending on first intersection", () => {
    fsm.update(true, 0);
    expect(fsm.state).toBe("gazeaware_pending");
    expect(fsm.isAware).toBe(false);
  });

  it("stays baseline when no intersection", () => {
    fsm.update(false, 0);
    fsm.update(false, 100);
    expect(fsm.state).toBe("baseline");
  });

  // --- gazeaware_pending → gazeaware ---

  it("transitions to gazeaware after pending_time_ms of continuous gaze", () => {
    let t = 0;
    fsm.update(true, t); // enter pending
    t = tickFor(fsm, 300, true, t);
    expect(fsm.state).toBe("gazeaware");
    expect(fsm.isAware).toBe(true);
  });

  it("stays pending if gaze is shorter than pending_time_ms", () => {
    fsm.update(true, 0);
    fsm.update(true, 100);
    expect(fsm.state).toBe("gazeaware_pending");
  });

  // --- gazeaware_pending → baseline (debounce) ---

  it("returns to baseline from pending after debounce expires", () => {
    fsm.update(true, 0); // enter pending
    // First false tick at t=16 sets gazeLostTimestamp, so need >200ms from there
    const t = tickFor(fsm, 250, false, 0);
    expect(fsm.state).toBe("baseline");
    expect(t).toBe(250);
  });

  it("stays pending during debounce window", () => {
    fsm.update(true, 0); // enter pending
    fsm.update(false, 50); // gaze lost
    fsm.update(false, 150); // still within 200ms debounce
    expect(fsm.state).toBe("gazeaware_pending");
  });

  it("recovers from brief gaze loss in pending", () => {
    fsm.update(true, 0); // enter pending
    fsm.update(false, 50); // brief loss
    fsm.update(true, 100); // gaze returns within debounce
    expect(fsm.state).toBe("gazeaware_pending");
    // Should still accumulate and eventually transition
    tickFor(fsm, 300, true, 100);
    expect(fsm.state).toBe("gazeaware");
  });

  // --- gazeaware → gaze_break ---

  it("transitions to gaze_break after mutual_time_ms", () => {
    fsm.update(true, 0);
    let t = tickFor(fsm, 300, true, 0); // pending → gazeaware
    expect(fsm.state).toBe("gazeaware");
    t = tickFor(fsm, 3600, true, t); // gazeaware → gaze_break
    expect(fsm.state).toBe("gaze_break");
    expect(fsm.isAware).toBe(false);
  });

  // --- gazeaware → baseline (debounce) ---

  it("returns to baseline from gazeaware after debounce expires", () => {
    fsm.update(true, 0);
    let t = tickFor(fsm, 300, true, 0); // → gazeaware
    expect(fsm.state).toBe("gazeaware");
    // First false tick at t+16 sets gazeLostTimestamp, need >200ms from there
    t = tickFor(fsm, 250, false, t);
    expect(fsm.state).toBe("baseline");
  });

  it("stays gazeaware during debounce window", () => {
    fsm.update(true, 0);
    let t = tickFor(fsm, 300, true, 0); // → gazeaware
    fsm.update(false, t + 50);
    fsm.update(false, t + 150);
    expect(fsm.state).toBe("gazeaware");
    expect(fsm.isAware).toBe(true);
  });

  // --- gaze_break → baseline / gazeaware_pending ---

  it("transitions from gaze_break to baseline when not intersecting", () => {
    fsm.update(true, 0);
    let t = tickFor(fsm, 300, true, 0); // → gazeaware
    t = tickFor(fsm, 3600, true, t); // → gaze_break
    expect(fsm.state).toBe("gaze_break");
    t = tickFor(fsm, 1250, false, t); // break expires, no gaze
    expect(fsm.state).toBe("baseline");
  });

  it("transitions from gaze_break to gazeaware_pending when still intersecting", () => {
    fsm.update(true, 0);
    let t = tickFor(fsm, 300, true, 0); // → gazeaware
    t = tickFor(fsm, 3600, true, t); // → gaze_break
    expect(fsm.state).toBe("gaze_break");
    t = tickFor(fsm, 1250, true, t); // break expires, still looking
    expect(fsm.state).toBe("gazeaware_pending");
  });

  // --- Full cycle ---

  it("completes a full cycle: baseline → pending → aware → break → pending", () => {
    const states: GazeState[] = [];

    fsm.update(true, 0);
    states.push(fsm.state); // gazeaware_pending

    let t = tickFor(fsm, 300, true, 0);
    states.push(fsm.state); // gazeaware

    t = tickFor(fsm, 3600, true, t);
    states.push(fsm.state); // gaze_break

    t = tickFor(fsm, 1250, true, t);
    states.push(fsm.state); // gazeaware_pending (still looking)

    expect(states).toEqual([
      "gazeaware_pending",
      "gazeaware",
      "gaze_break",
      "gazeaware_pending",
    ]);
  });

  // --- reset ---

  it("resets to baseline", () => {
    fsm.update(true, 0);
    tickFor(fsm, 300, true, 0);
    expect(fsm.state).toBe("gazeaware");
    fsm.reset();
    expect(fsm.state).toBe("baseline");
    expect(fsm.isAware).toBe(false);
  });

  // --- Custom profile ---

  it("respects custom timing from profile", () => {
    const fast = createFSM({
      pending_time_ms: 50,
      mutual_time_ms: 100,
      break_time_ms: 50,
      lose_debounce_ms: 10,
    });

    fast.update(true, 0);
    let t = tickFor(fast, 50, true, 0, 10);
    expect(fast.state).toBe("gazeaware");

    t = tickFor(fast, 100, true, t, 10);
    expect(fast.state).toBe("gaze_break");

    t = tickFor(fast, 50, false, t, 10);
    expect(fast.state).toBe("baseline");
  });

  // --- Edge: rapid toggle ---

  it("handles rapid intersection toggling without breaking", () => {
    let t = 0;
    for (let i = 0; i < 20; i++) {
      fsm.update(true, t);
      t += 10;
      fsm.update(false, t);
      t += 10;
    }
    // Rapid toggling (10ms on/10ms off) never exceeds debounce (200ms),
    // so FSM stays in pending or advances to gazeaware as true-time accumulates
    expect(["baseline", "gazeaware_pending", "gazeaware"]).toContain(fsm.state);
  });
});
