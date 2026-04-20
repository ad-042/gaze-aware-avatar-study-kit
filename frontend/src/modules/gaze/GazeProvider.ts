/** Normalized gaze point: x and y in [0, 1] relative to tracking area. */
export interface GazePoint {
  x: number;
  y: number;
}

/** Abstract source of gaze data (mouse, Tobii, backend relay, etc.). */
export interface GazeProvider {
  /** Most recent gaze point (updated continuously while running). */
  readonly current: GazePoint;
  /** Begin producing gaze data. */
  start(): void;
  /** Stop producing gaze data and release resources. */
  stop(): void;
}
