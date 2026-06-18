import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DwellInput, MonitoringConfig } from "@focus/shared";

const processObservations = vi.fn();
const ingestObservations = vi.fn();
const synthesizePendingObservations = vi.fn();
const saveObservationImages = vi.fn();
let nextId = 0;

vi.mock("./firebase", () => ({
  callables: {
    processObservations,
    ingestObservations,
    synthesizePendingObservations,
  },
}));

vi.mock("./localObservationImages", () => ({
  createClientObservationId: () => `obs_${++nextId}`.padEnd(8, "0"),
  saveObservationImages,
}));

const { MonitoringController, MAX_PARALLEL_INGESTS } = await import("./monitoring.js");

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

async function flushPromises(times = 8): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

describe("MonitoringController", () => {
  beforeEach(() => {
    nextId = 0;
    processObservations.mockReset();
    ingestObservations.mockReset();
    synthesizePendingObservations.mockReset();
    saveObservationImages.mockReset();
    saveObservationImages.mockResolvedValue(undefined);
    processObservations.mockResolvedValue({
      data: { interpreted: true, currentIntent: "You are testing.", confidence: 0.8 },
    });
    ingestObservations.mockResolvedValue({
      data: { ok: true, persisted: 1, observationIds: ["obs_1000"] },
    });
    synthesizePendingObservations.mockResolvedValue({
      data: {
        ok: true,
        interpreted: true,
        observationCount: 1,
        currentIntent: "You are testing.",
        confidence: 0.8,
      },
    });
  });

  it("keeps metadata-only dwells when image capture is unavailable", async () => {
    const liveCounts: number[] = [];
    const controller = new MonitoringController(
      "session1",
      { ...cfg, maxBatch: 1 },
      undefined,
      undefined,
      (batches) =>
        liveCounts.push(batches.reduce((total, batch) => total + batch.observations.length, 0)),
    );

    controller.push(dwell({ cursorCropDataUrl: undefined }));
    await Promise.resolve();
    await Promise.resolve();

    expect(liveCounts).toContain(1);
    expect(saveObservationImages).toHaveBeenCalledWith(
      "session1",
      expect.objectContaining({ clientObservationId: "obs_1000", cursorCropDataUrl: undefined }),
    );
    expect(ingestObservations).toHaveBeenCalledWith({
      sessionId: "session1",
      observations: [expect.objectContaining({ clientObservationId: "obs_1000" })],
    });
  });

  it("buffers live batches, ingests at max batch, and synthesizes in the background", async () => {
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
    await flushPromises();

    expect(ingestObservations).toHaveBeenCalledWith({
      sessionId: "session1",
      observations: [
        expect.objectContaining({ clientObservationId: "obs_1000" }),
        expect.objectContaining({ clientObservationId: "obs_2000" }),
      ],
    });
    expect(synthesizePendingObservations).toHaveBeenCalledWith({
      sessionId: "session1",
      reason: "timer",
    });
    expect(results).toEqual([["You are testing.", 0.8]]);
    expect(statuses).toContain("analyzing");
    expect(liveCounts).toContain(2);
  });

  it("falls back to processObservations when the new ingest callable is not deployed yet", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const results: Array<[string, number]> = [];
    ingestObservations.mockRejectedValueOnce({ code: "functions/not-found" });
    const controller = new MonitoringController("session1", cfg, (intent, confidence) =>
      results.push([intent, confidence]),
    );

    controller.push(dwell({ novelty: "high" }));
    controller.push(dwell({ novelty: "medium" }));
    await flushPromises();

    expect(processObservations).toHaveBeenCalledWith({
      sessionId: "session1",
      observations: [
        expect.objectContaining({ clientObservationId: "obs_1000" }),
        expect.objectContaining({ clientObservationId: "obs_2000" }),
      ],
    });
    expect(synthesizePendingObservations).not.toHaveBeenCalled();
    expect(results).toEqual([["You are testing.", 0.8]]);
    warn.mockRestore();
  });

  it("caps parallel ingest batches and starts queued batches as slots free up", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    ingestObservations.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const controller = new MonitoringController("session1", cfg);

    for (let i = 0; i < cfg.maxBatch * (MAX_PARALLEL_INGESTS + 1); i += 1) {
      controller.push(dwell({ timestamp: i }));
    }

    expect(ingestObservations).toHaveBeenCalledTimes(MAX_PARALLEL_INGESTS);
    resolvers[0]?.({ data: { ok: true, persisted: cfg.maxBatch, observationIds: [] } });
    await flushPromises();

    expect(ingestObservations).toHaveBeenCalledTimes(MAX_PARALLEL_INGESTS + 1);
  });

  it("stop waits for ingest completion but does not wait for synthesis completion", async () => {
    let resolveIngest: (value: unknown) => void = () => undefined;
    ingestObservations.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveIngest = resolve;
        }),
    );
    synthesizePendingObservations.mockImplementation(() => new Promise(() => undefined));
    const controller = new MonitoringController("session1", cfg);

    controller.push(dwell({ novelty: "high" }));
    controller.push(dwell({ novelty: "medium" }));
    const stopped = controller.stop();

    expect(synthesizePendingObservations).not.toHaveBeenCalled();
    resolveIngest({ data: { ok: true, persisted: cfg.maxBatch, observationIds: [] } });
    await stopped;

    expect(synthesizePendingObservations).toHaveBeenCalledWith({
      sessionId: "session1",
      reason: "stop",
    });
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
