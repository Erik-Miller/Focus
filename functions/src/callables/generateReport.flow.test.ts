import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runReport: vi.fn(),
  synthesizePendingObservationBatch: vi.fn(),
  db: {
    runTransaction: vi.fn(),
  },
}));

vi.mock("../firebaseApp.js", () => ({
  db: mocks.db,
}));

vi.mock("../agent/runAgent.js", () => ({
  runReport: mocks.runReport,
}));

vi.mock("./processObservations.js", () => ({
  synthesizePendingObservationBatch: mocks.synthesizePendingObservationBatch,
}));

const { ensureObservationsSynthesizedBeforeReport } = await import("./generateReport.js");

describe("generateReport analysis gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.synthesizePendingObservationBatch.mockResolvedValue({
      ok: true,
      interpreted: true,
      observationCount: 8,
    });
  });

  it("runs pending synthesis before allowing report generation to continue", async () => {
    const pendingGet = vi
      .fn()
      .mockResolvedValueOnce({ empty: false })
      .mockResolvedValueOnce({ empty: true });
    const query = {
      where: vi.fn(() => query),
      limit: vi.fn(() => query),
      get: pendingGet,
    };
    const ref = {
      collection: vi.fn(() => query),
      update: vi.fn(),
    };

    await ensureObservationsSynthesizedBeforeReport("session1", ref as never, {
      maxWaitMs: 1_000,
      pollMs: 0,
    });

    expect(query.where).toHaveBeenCalledWith("summary", "==", "");
    expect(mocks.synthesizePendingObservationBatch).toHaveBeenCalledWith("session1", "stop");
    expect(ref.update).toHaveBeenCalledWith(
      expect.objectContaining({
        agentActivity: "Finishing observation analysis before writing the report.",
      }),
    );
  });

  it("does not run synthesis when no pending summaries remain", async () => {
    const query = {
      where: vi.fn(() => query),
      limit: vi.fn(() => query),
      get: vi.fn().mockResolvedValue({ empty: true }),
    };
    const ref = {
      collection: vi.fn(() => query),
      update: vi.fn(),
    };

    await ensureObservationsSynthesizedBeforeReport("session1", ref as never, {
      maxWaitMs: 1_000,
      pollMs: 0,
    });

    expect(mocks.synthesizePendingObservationBatch).not.toHaveBeenCalled();
    expect(ref.update).not.toHaveBeenCalled();
  });
});
