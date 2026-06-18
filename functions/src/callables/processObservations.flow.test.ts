import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DwellInput, Session } from "@focus/shared";

const mocks = vi.hoisted(() => {
  const batchSet = vi.fn();
  const batchCommit = vi.fn();
  const fileDownload = vi.fn();
  const fileGetMetadata = vi.fn();
  const fileSave = vi.fn();
  const refUpdate = vi.fn();
  const refGet = vi.fn();
  const obsDoc = { id: "obs_12345678" };
  const obsCollection = {
    doc: vi.fn(() => obsDoc),
    where: vi.fn(() => obsCollection),
    orderBy: vi.fn(() => obsCollection),
    limit: vi.fn(() => obsCollection),
    get: vi.fn(),
  };
  const sessionRef = {
    get: refGet,
    update: refUpdate,
    collection: vi.fn(() => obsCollection),
  };
  const sessions = {
    doc: vi.fn(() => sessionRef),
  };
  return {
    batchSet,
    batchCommit,
    refUpdate,
    refGet,
    obsCollection,
    sessionRef,
    sessions,
    db: {
      collection: vi.fn(() => sessions),
      batch: vi.fn(() => ({ set: batchSet, commit: batchCommit })),
      runTransaction: vi.fn(),
    },
    bucket: {
      file: vi.fn(() => ({
        download: fileDownload,
        getMetadata: fileGetMetadata,
        save: fileSave,
      })),
      name: "focus-test.appspot.com",
    },
    fileDownload,
    fileGetMetadata,
    fileSave,
    runMonitoring: vi.fn(),
  };
});

vi.mock("../firebaseApp.js", () => ({
  db: mocks.db,
  bucket: mocks.bucket,
  FieldValue: {
    delete: vi.fn(() => ({ delete: true })),
    increment: vi.fn((value: number) => ({ increment: value })),
  },
}));

vi.mock("../agent/runAgent.js", () => ({
  runMonitoring: mocks.runMonitoring,
}));

const { agentInputFromObservation, persistRawObservations, synthesizePendingObservationBatch } =
  await import("./processObservations.js");

const session: Session = {
  id: "session1",
  ownerUid: "uid1",
  status: "active",
  isDemo: false,
  startedAt: 1,
  currentIntent: "",
  confidence: 0,
  activeApps: [],
  discoveredWorkflows: [],
  agentFiles: {},
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    totalTokens: 0,
    callCount: 0,
    byKind: {
      observation: {
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        totalTokens: 0,
        callCount: 0,
      },
      chat: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0, callCount: 0 },
      report: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0, callCount: 0 },
    },
  },
  lastUpdateAt: 0,
  updateInFlight: false,
};

const dwell: DwellInput = {
  clientObservationId: "obs_12345678",
  timestamp: 123,
  app: "Chrome",
  windowTitle: "News",
  mouse: { x: 10, y: 20 },
  dwellMs: 300,
  novelty: "high",
  frameHash: "hash",
};

describe("observation ingest and synthesis flow helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refGet.mockResolvedValue({ exists: true, data: () => session });
    mocks.batchCommit.mockResolvedValue(undefined);
    mocks.fileDownload.mockResolvedValue([Buffer.from("image-bytes")]);
    mocks.fileGetMetadata.mockResolvedValue([{ contentType: "image/png" }]);
    mocks.fileSave.mockResolvedValue(undefined);
    mocks.refUpdate.mockResolvedValue(undefined);
    mocks.db.runTransaction.mockResolvedValue(false);
  });

  it("persists raw observations without taking the synthesis lock or invoking the model", async () => {
    const result = await persistRawObservations("session1", [dwell]);

    expect(result).toEqual({ persisted: 1, observationIds: ["obs_12345678"] });
    expect(mocks.batchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "obs_12345678",
        summary: "",
        inferredIntent: "",
      }),
      { merge: true },
    );
    expect(mocks.refUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentActivity: "Captured new activity in Chrome.",
        agentActivityAt: expect.any(Number),
      }),
    );
    expect(mocks.refUpdate.mock.calls[0]?.[0]).not.toHaveProperty("updateInFlight");
    expect(mocks.db.runTransaction).not.toHaveBeenCalled();
    expect(mocks.runMonitoring).not.toHaveBeenCalled();
  });

  it("stores screenshot paths alongside download urls for later synthesis", async () => {
    await persistRawObservations("session1", [
      {
        ...dwell,
        cursorCropDataUrl: "data:image/png;base64,Y3JvcA==",
      },
    ]);

    expect(mocks.bucket.file).toHaveBeenCalledWith("screenshots/session1/obs_12345678-crop");
    expect(mocks.batchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cursorCropPath: "screenshots/session1/obs_12345678-crop",
        cursorCropUrl: expect.stringContaining("screenshots%2Fsession1%2Fobs_12345678-crop"),
      }),
      { merge: true },
    );
  });

  it("converts persisted storage images back to data urls for synthesis", async () => {
    const input = await agentInputFromObservation({
      id: "obs_12345678",
      sessionId: "session1",
      batchId: "batch1",
      timestamp: 123,
      app: "Chrome",
      windowTitle: "News",
      mouse: { x: 10, y: 20 },
      dwellMs: 300,
      novelty: "high",
      frameHash: "hash",
      cursorCropUrl:
        "https://firebasestorage.googleapis.com/v0/b/focus-test.appspot.com/o/screenshots%2Fsession1%2Fobs_12345678-crop?alt=media&token=abc",
      summary: "",
      inferredIntent: "",
      confidence: 0,
      evidence: [],
      alternatives: [],
      suggestedNextAction: "",
    });

    expect(mocks.bucket.file).toHaveBeenCalledWith("screenshots/session1/obs_12345678-crop");
    expect(input.cursorCropDataUrl).toBe("data:image/png;base64,aW1hZ2UtYnl0ZXM=");
  });

  it("skips synthesis when another fresh synthesis lock is held", async () => {
    const result = await synthesizePendingObservationBatch("session1", "timer");

    expect(result).toEqual({
      ok: true,
      interpreted: false,
      observationCount: 0,
      reason: "update-in-flight",
    });
    expect(mocks.runMonitoring).not.toHaveBeenCalled();
  });
});
