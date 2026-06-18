import { describe, expect, it } from "vitest";
import { classifyNoveltyForSnapshot, shouldCaptureFullScreenSnapshot } from "./captureLogic.js";

describe("capture novelty and cadence", () => {
  it("marks first emission and app changes as high novelty", () => {
    expect(
      classifyNoveltyForSnapshot(
        "0".repeat(64),
        "Chrome",
        "Docs",
        { hash: "", app: "", title: "" },
        6,
      ),
    ).toBe("high");
    expect(
      classifyNoveltyForSnapshot(
        "0".repeat(64),
        "Safari",
        "Docs",
        { hash: "0".repeat(64), app: "Chrome", title: "Docs" },
        6,
      ),
    ).toBe("high");
  });

  it("keeps duplicate-looking dwells as low novelty and differentiates medium novelty", () => {
    const last = { hash: "0".repeat(64), app: "Chrome", title: "Docs" };

    expect(classifyNoveltyForSnapshot("0".repeat(64), "Chrome", "Docs", last, 6)).toBe("low");
    expect(
      classifyNoveltyForSnapshot(`${"1".repeat(6)}${"0".repeat(58)}`, "Chrome", "Docs", last, 6),
    ).toBe("low");
    expect(
      classifyNoveltyForSnapshot(`${"1".repeat(14)}${"0".repeat(50)}`, "Chrome", "Docs", last, 6),
    ).toBe("medium");
    expect(classifyNoveltyForSnapshot("0".repeat(64), "Chrome", "Other", last, 6)).toBe("medium");
  });

  it("captures full screen only on configured cadence", () => {
    expect(shouldCaptureFullScreenSnapshot(1, 8)).toBe(false);
    expect(shouldCaptureFullScreenSnapshot(8, 8)).toBe(true);
    expect(shouldCaptureFullScreenSnapshot(16, 8)).toBe(true);
    expect(shouldCaptureFullScreenSnapshot(8, 0)).toBe(false);
  });
});
