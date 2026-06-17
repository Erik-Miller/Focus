/**
 * Tunable knobs for the two-speed agent loop.
 *
 * Monitoring (passive observation) is deliberately throttled + batched so the
 * agent does not loop on small things. Interactive chat is unthrottled.
 */
export interface MonitoringConfig {
  /** Cursor must stay within `dwellRadiusPx` for this long to count as a dwell. */
  dwellMs: number;
  /** Radius (px) the cursor may jitter within and still be considered "still". */
  dwellRadiusPx: number;
  /** Cursor polling interval (ms). ~60Hz. */
  pollIntervalMs: number;
  /** Edge length (px) of the square crop captured around the cursor. */
  captureSize: number;
  /** Capture a full-screen context frame on every Nth emitted snapshot. */
  fullScreenshotEverySnapshots: number;
  /** Minimum time between agent "understanding" updates during monitoring. */
  minUpdateIntervalMs: number;
  /** When context is stable, cadence grows toward this ceiling. */
  idleBackoffMaxMs: number;
  /** Force a flush once this many candidate observations are buffered. */
  maxBatch: number;
  /**
   * dHash Hamming distance below which two frames are considered duplicates.
   * Lower = stricter (more frames treated as novel).
   */
  duplicateHashDistance: number;
}

export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  dwellMs: 300,
  dwellRadiusPx: 6,
  pollIntervalMs: 16,
  captureSize: 250,
  fullScreenshotEverySnapshots: 8,
  minUpdateIntervalMs: 20_000,
  idleBackoffMaxMs: 90_000,
  maxBatch: 8,
  duplicateHashDistance: 6,
};
