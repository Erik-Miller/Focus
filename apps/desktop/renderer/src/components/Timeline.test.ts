import { describe, expect, it } from "vitest";
import type { Observation } from "@focus/shared";
import type { LiveTimelineBatch } from "../monitoring.js";
import {
  buildTimelineEntries,
  thumbnailUrlForObservation,
  trayImageUrlForObservation,
} from "./Timeline.js";

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: "obs1",
    sessionId: "session1",
    batchId: "batch1",
    timestamp: 1000,
    app: "Chrome",
    windowTitle: "News",
    mouse: { x: 1, y: 2 },
    dwellMs: 300,
    novelty: "high",
    frameHash: "hash",
    summary: "You reviewed news.",
    inferredIntent: "You reviewed news.",
    confidence: 0.8,
    evidence: [],
    alternatives: [],
    suggestedNextAction: "",
    cursorCropUrl: "remote-crop",
    fullScreenshotUrl: "remote-full",
    ...overrides,
  };
}

describe("timeline helpers", () => {
  it("groups persisted observations by batch and appends live-only batches", () => {
    const live: LiveTimelineBatch = {
      id: "captured:session1:0:obs3",
      status: "captured",
      updatedAt: 2000,
      observations: [
        {
          id: "obs2",
          timestamp: 1100,
          app: "Code",
          windowTitle: "App.tsx",
          mouse: { x: 1, y: 2 },
          dwellMs: 300,
          novelty: "medium",
          frameHash: "hash2",
          cursorCropDataUrl: "live-duplicate",
        },
        {
          id: "obs3",
          timestamp: 1200,
          app: "Terminal",
          windowTitle: "Tests",
          mouse: { x: 1, y: 2 },
          dwellMs: 300,
          novelty: "high",
          frameHash: "hash3",
          cursorCropDataUrl: "live-crop",
        },
      ],
    };

    const entries = buildTimelineEntries(
      [observation(), observation({ id: "obs2", timestamp: 1100, summary: "" })],
      [live],
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: "batch:batch1", count: 2, status: "analyzing" });
    expect(entries[1]).toMatchObject({
      id: "live:captured:session1:0:obs3",
      count: 1,
      status: "captured",
    });
  });

  it("prefers local images for thumbnails and full screenshots for trays", () => {
    const images = new Map([
      [
        "obs1",
        {
          cursorCropDataUrl: "local-crop",
          fullScreenshotDataUrl: "local-full",
        },
      ],
    ]);
    const obs = observation({ cursorCropDataUrl: "live-crop", fullScreenshotDataUrl: "live-full" });

    expect(thumbnailUrlForObservation(obs, images)).toBe("local-crop");
    expect(trayImageUrlForObservation(obs, images)).toBe("local-full");
    expect(thumbnailUrlForObservation(observation({ id: "obs2" }), new Map())).toBe("remote-crop");
  });
});
