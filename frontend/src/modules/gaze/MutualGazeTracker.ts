/**
 * Derives avatar eye contact and mutual gaze signals from the actual
 * applied eye direction (yaw/pitch in degrees) and user face intersection.
 *
 * avatarEyeContact: true when the avatar's applied eye direction is
 * within a degree threshold of center (0°, 0°), meaning the avatar
 * is oriented toward the user. Values come from
 * VRMLookAtSmoother.appliedYaw / appliedPitch, which include saccade
 * offsets.
 *
 * mutualGaze: true when both avatarEyeContact AND user face
 * intersection are true simultaneously.
 */
export class MutualGazeTracker {
  private readonly threshold: number;

  /**
   * @param eyeContactThresholdDeg - Maximum combined yaw/pitch
   *   magnitude (degrees) to count as eye contact. Default 10°.
   */
  constructor(eyeContactThresholdDeg = 10.0) {
    this.threshold = eyeContactThresholdDeg;
  }

  /**
   * Determine whether the avatar is making eye contact based on
   * the applied eye yaw/pitch after saccade offsets.
   */
  isAvatarEyeContact(yawDeg: number, pitchDeg: number): boolean {
    const mag = Math.sqrt(yawDeg * yawDeg + pitchDeg * pitchDeg);
    return mag < this.threshold;
  }

  /**
   * Mutual gaze requires both conditions to be true.
   */
  isMutualGaze(
    avatarEyeContact: boolean,
    userIntersection: boolean,
  ): boolean {
    return avatarEyeContact && userIntersection;
  }
}
