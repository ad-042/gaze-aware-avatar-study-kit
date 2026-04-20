import type { GazePoint, GazeProvider } from "./GazeProvider.js";

/**
 * Demo gaze source: tracks the mouse position over a target element
 * and normalises it to [0, 1].  No hardware required.
 */
export class MouseProvider implements GazeProvider {
  private readonly target: HTMLElement;
  private point: GazePoint = { x: 0, y: 0 };
  private listening = false;

  constructor(target: HTMLElement) {
    this.target = target;
  }

  get current(): GazePoint {
    return this.point;
  }

  start(): void {
    if (this.listening) return;
    this.target.addEventListener("mousemove", this.onMove);
    this.listening = true;
  }

  stop(): void {
    this.target.removeEventListener("mousemove", this.onMove);
    this.listening = false;
  }

  private onMove = (e: MouseEvent): void => {
    const rect = this.target.getBoundingClientRect();
    this.point = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };
}
