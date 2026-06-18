import { describe, expect, it } from "vitest";
import { DEFAULT_MONITORING_CONFIG } from "./monitoringConfig.js";

describe("DEFAULT_MONITORING_CONFIG", () => {
  it("keeps capture and batching knobs internally consistent", () => {
    expect(DEFAULT_MONITORING_CONFIG.dwellMs).toBeGreaterThan(0);
    expect(DEFAULT_MONITORING_CONFIG.dwellRadiusPx).toBeGreaterThan(0);
    expect(DEFAULT_MONITORING_CONFIG.captureSize).toBe(250);
    expect(DEFAULT_MONITORING_CONFIG.fullScreenshotEverySnapshots).toBeGreaterThan(1);
    expect(DEFAULT_MONITORING_CONFIG.maxBatch).toBeGreaterThan(1);
    expect(DEFAULT_MONITORING_CONFIG.idleBackoffMaxMs).toBeGreaterThan(
      DEFAULT_MONITORING_CONFIG.minUpdateIntervalMs,
    );
    expect(DEFAULT_MONITORING_CONFIG.duplicateHashDistance).toBeLessThan(14);
  });
});
