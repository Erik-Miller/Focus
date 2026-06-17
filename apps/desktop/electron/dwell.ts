/**
 * Detects a dwell: the cursor staying within `radiusPx` for at least `dwellMs`.
 * Fires once per pause (re-arms after the cursor moves away).
 */
export class DwellDetector {
  private anchor: { x: number; y: number; t: number } | null = null;
  private fired = false;

  constructor(
    private readonly dwellMs: number,
    private readonly radiusPx: number,
  ) {}

  /** Returns true exactly once when a new dwell is confirmed. */
  tick(x: number, y: number, now: number): boolean {
    if (!this.anchor) {
      this.anchor = { x, y, t: now };
      this.fired = false;
      return false;
    }
    const dx = x - this.anchor.x;
    const dy = y - this.anchor.y;
    const moved = dx * dx + dy * dy > this.radiusPx * this.radiusPx;
    if (moved) {
      this.anchor = { x, y, t: now };
      this.fired = false;
      return false;
    }
    if (!this.fired && now - this.anchor.t >= this.dwellMs) {
      this.fired = true;
      return true;
    }
    return false;
  }
}
