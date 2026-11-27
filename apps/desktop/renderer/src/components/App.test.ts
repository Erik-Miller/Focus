import { describe, expect, it } from "vitest";
import {
  formatReportStartCountdown,
  liveMonitoringPhaseFor,
  monitoringLabelFor,
} from "../appStatus";

describe("App status helpers", () => {
  it("formats report countdown labels", () => {
    expect(formatReportStartCountdown(null)).toBeNull();
    expect(formatReportStartCountdown(0)).toBe("Summary starting...");
    expect(formatReportStartCountdown(65)).toBe("Summary starts in 1:05");
    expect(formatReportStartCountdown(5, true)).toBe("Update starts in 0:05");
  });

  it("prioritizes stopping, capture, analyzing, and idle status labels", () => {
    expect(
      monitoringLabelFor({
        captureState: "idle",
        monitoringStatus: { phase: "idle", bufferCount: 0 },
        sessionUpdateInFlight: false,
        stopping: true,
      }),
    ).toBe("Stopping");
    expect(
      monitoringLabelFor({
        captureState: "capturing",
        monitoringStatus: { phase: "idle", bufferCount: 0 },
        sessionUpdateInFlight: false,
        stopping: false,
      }),
    ).toBe("Capturing");
    expect(
      monitoringLabelFor({
        captureState: "idle",
        monitoringStatus: { phase: "analyzing", bufferCount: 0 },
        sessionUpdateInFlight: false,
        stopping: false,
      }),
    ).toBe("Analyzing");
    expect(
      monitoringLabelFor({
        captureState: "idle",
        monitoringStatus: { phase: "idle", bufferCount: 0 },
        sessionUpdateInFlight: true,
        stopping: false,
      }),
    ).toBe("Analyzing");
    expect(
      monitoringLabelFor({
        captureState: "idle",
        monitoringStatus: { phase: "idle", bufferCount: 0 },
        sessionUpdateInFlight: false,
        stopping: false,
      }),
    ).toBe("Monitoring");
  });

  it("maps live monitoring phases with the same priority order", () => {
    expect(
      liveMonitoringPhaseFor({
        captureState: "idle",
        monitoringStatus: { phase: "idle", bufferCount: 0 },
        sessionUpdateInFlight: false,
        stopping: true,
      }),
    ).toBe("stopping");
    expect(
      liveMonitoringPhaseFor({
        captureState: "capturing",
        monitoringStatus: { phase: "idle", bufferCount: 0 },
        sessionUpdateInFlight: false,
        stopping: false,
      }),
    ).toBe("capturing");
    expect(
      liveMonitoringPhaseFor({
        captureState: "idle",
        monitoringStatus: { phase: "analyzing", bufferCount: 0 },
        sessionUpdateInFlight: false,
        stopping: false,
      }),
    ).toBe("analyzing");
    expect(
      liveMonitoringPhaseFor({
        captureState: "idle",
        monitoringStatus: { phase: "idle", bufferCount: 0 },
        sessionUpdateInFlight: true,
        stopping: false,
      }),
    ).toBe("analyzing");
    expect(
      liveMonitoringPhaseFor({
        captureState: "idle",
        monitoringStatus: { phase: "idle", bufferCount: 0 },
        sessionUpdateInFlight: false,
        stopping: false,
      }),
    ).toBe("monitoring");
  });
});
