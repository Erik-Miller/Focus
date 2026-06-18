import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DwellInput, MonitoringConfig } from "@focus/shared";

const processObservations = vi.fn();
const saveObservationImages = vi.fn();
let nextId = 0;

vi.mock("./firebase", () => ({
  callables: {
    processObservations,
  },
}));

vi.mock("./localObservationImages", () => ({
  createClientObservationId: () => `obs_${++nextId}`.padEnd(8, "0"),
  saveObservationImages,
}));

const { MonitoringController } = await import("./monitoring.js");

const cfg: MonitoringConfig = {
  dwellMs: 300,
  dwellRadiusPx: 6,
  pollIntervalMs: 16,
  captureSize: 250,
  fullScreenshotEverySnapshots: 8,
  minUpdateIntervalMs: 1_000,
  idleBackoffMaxMs: 10_000,
  maxBatch: 2,
  duplicateHashDistance: 6,
};

function dwell(overrides: Partial<DwellInput> = {}): DwellInput {
  return {
    timestamp: Date.now(),
    app: "Chrome",
    windowTitle: "News",
    mouse: { x: 1, y: 2 },
    dwellMs: 300,
    novelty: "medium",
    frameHash: "hash",
    cursorCropDataUrl: "data:image/jpeg;base64,crop",
    ...overrides,
  };
}

describe("MonitoringController", () => {
  beforeEach(() => {
    nextId = 0;
    processObservations.mockReset();
    saveObservationImages.mockReset();
    saveObservationImages.mockResolvedValue(undefined);
    processObservations.mockResolvedValue({
      data: { interpreted: true, currentIntent: "You are testing.", confidence: 0.8 },
    });
  });

  it("skips dwells without cursor crops", () => {
    const statuses: unknown[] = [];
    const controller = new MonitoringController("session1", cfg, undefined, (status) =>
      statuses.push(status),
    );

    controller.push(dwell({ cursorCropDataUrl: undefined }));

    expect(processObservations).not.toHaveBeenCalled();
    expect(saveObservationImages).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);
  });

  it("buffers live batches and flushes once max batch is reached", async () => {
    const results: Array<[string, number]> = [];
    const statuses: string[] = [];
    const liveCounts: number[] = [];
    const controller = new MonitoringController(
      "session1",
      cfg,
      (intent, confidence) => results.push([intent, confidence]),
      (status) => statuses.push(status.phase),
      (batches) =>
        liveCounts.push(batches.reduce((total, batch) => total + batch.observations.length, 0)),
    );

    controller.start();
    controller.push(dwell({ novelty: "high" }));
    controller.push(dwell({ novelty: "medium" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(processObservations).toHaveBeenCalledWith({
      sessionId: "session1",
      observations: [
        expect.objectContaining({ clientObservationId: "obs_1000" }),
        expect.objectContaining({ clientObservationId: "obs_2000" }),
      ],
    });
    expect(results).toEqual([["You are testing.", 0.8]]);
    expect(statuses).toContain("analyzing");
    expect(liveCounts).toContain(2);
  });

  it("acknowledges server-observed ids and removes matching live batches", () => {
    const liveCounts: number[] = [];
    const controller = new MonitoringController(
      "session1",
      { ...cfg, maxBatch: 10 },
      undefined,
      undefined,
      (batches) =>
        liveCounts.push(batches.reduce((total, batch) => total + batch.observations.length, 0)),
    );

    controller.push(dwell({ clientObservationId: "obs_known1" }));
    controller.push(dwell({ clientObservationId: "obs_known2" }));
    controller.acknowledgeObserved(new Set(["obs_known1"]));

    expect(liveCounts.at(-1)).toBe(1);
    expect(controller.getLiveTimelineBatches()[0]?.observations[0]?.id).toBe("obs_known2");
  });
});
